import * as React from "react";
import { View, Text, Pressable, Share } from "react-native";
import * as Clipboard from 'expo-clipboard';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { MarkdownContentView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { layout } from "./layout";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { Option } from './markdown/MarkdownView';
import { hapticsLight } from '@/components/haptics';

type MessageViewProps = {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  markdownCopyV2: boolean;
  onOptionPress?: (option: Option) => void;
  getMessageById?: (id: string) => Message | null;
};

function MessageViewComponent(props: MessageViewProps) {
  return (
    <View style={styles.messageContainer}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          markdownCopyV2={props.markdownCopyV2}
          onOptionPress={props.onOptionPress}
          getMessageById={props.getMessageById}
        />
      </View>
    </View>
  );
}

function areMessageContentsEqual(prevMessage: Message, nextMessage: Message): boolean {
  if (prevMessage === nextMessage) {
    return true;
  }

  if (prevMessage.kind !== nextMessage.kind || prevMessage.id !== nextMessage.id || prevMessage.createdAt !== nextMessage.createdAt) {
    return false;
  }

  if (prevMessage.kind === 'user-text' && nextMessage.kind === 'user-text') {
    return prevMessage.text === nextMessage.text
      && prevMessage.displayText === nextMessage.displayText
      && prevMessage.meta === nextMessage.meta;
  }

  if (prevMessage.kind === 'agent-text' && nextMessage.kind === 'agent-text') {
    return prevMessage.text === nextMessage.text
      && prevMessage.isThinking === nextMessage.isThinking
      && prevMessage.meta === nextMessage.meta;
  }

  if (prevMessage.kind === 'tool-call' && nextMessage.kind === 'tool-call') {
    return prevMessage.tool === nextMessage.tool
      && prevMessage.children === nextMessage.children
      && prevMessage.meta === nextMessage.meta;
  }

  if (prevMessage.kind === 'agent-event' && nextMessage.kind === 'agent-event') {
    return prevMessage.event === nextMessage.event
      && prevMessage.meta === nextMessage.meta;
  }

  return false;
}

function shouldCompareMetadata(message: Message): boolean {
  return message.kind === 'tool-call';
}

function areToolMetadataEqual(prevMetadata: Metadata | null, nextMetadata: Metadata | null): boolean {
  if (prevMetadata === nextMetadata) {
    return true;
  }

  return prevMetadata?.flavor === nextMetadata?.flavor
    && prevMetadata?.path === nextMetadata?.path;
}

export const MessageView = React.memo(MessageViewComponent, (prevProps, nextProps) => (
  areMessageContentsEqual(prevProps.message, nextProps.message)
  && (
    !shouldCompareMetadata(nextProps.message)
    || areToolMetadataEqual(prevProps.metadata, nextProps.metadata)
  )
  && prevProps.sessionId === nextProps.sessionId
  && prevProps.markdownCopyV2 === nextProps.markdownCopyV2
  && prevProps.onOptionPress === nextProps.onOptionPress
));

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  markdownCopyV2: boolean;
  onOptionPress?: (option: Option) => void;
  getMessageById?: (id: string) => Message | null;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return (
        <UserTextBlock
          message={props.message}
          sessionId={props.sessionId}
          markdownCopyV2={props.markdownCopyV2}
          onOptionPress={props.onOptionPress}
        />
      );

    case 'agent-text':
      return (
        <AgentTextBlock
          message={props.message}
          sessionId={props.sessionId}
          markdownCopyV2={props.markdownCopyV2}
          onOptionPress={props.onOptionPress}
        />
      );

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  sessionId: string;
  markdownCopyV2: boolean;
  onOptionPress?: (option: Option) => void;
}) {
  return (
    <View style={styles.userMessageContainer}>
      <View style={styles.userMessageBubble}>
        <MarkdownContentView
          markdown={props.message.displayText || props.message.text}
          onOptionPress={props.onOptionPress}
          sessionId={props.sessionId}
          markdownCopyV2={props.markdownCopyV2}
        />
        {/* {__DEV__ && (
          <Text style={styles.debugText}>{JSON.stringify(props.message.meta)}</Text>
        )} */}
      </View>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
  markdownCopyV2: boolean;
  onOptionPress?: (option: Option) => void;
}) {
  // Hide thinking messages
  if (props.message.isThinking) {
    return null;
  }

  const usageLimitText = getUsageLimitText(props.message.text);
  if (usageLimitText) {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{usageLimitText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.agentMessageContainer}>
      <MarkdownContentView
        markdown={props.message.text}
        onOptionPress={props.onOptionPress}
        sessionId={props.sessionId}
        markdownCopyV2={props.markdownCopyV2}
      />
      <AgentMessageActions text={props.message.text} />
    </View>
  );
}

function AgentMessageActions(props: { text: string }) {
  const { theme } = useUnistyles();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    hapticsLight();
    try {
      await Clipboard.setStringAsync(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }, [props.text]);

  const handleShare = React.useCallback(async () => {
    hapticsLight();
    try {
      await Share.share({ message: props.text });
    } catch {}
  }, [props.text]);

  return (
    <View style={styles.agentActionsRow}>
      <Pressable
        hitSlop={8}
        onPress={handleCopy}
        style={({ pressed }) => [styles.agentActionButton, pressed && { opacity: 0.5, transform: [{ scale: 0.94 }] }]}
      >
        <Octicons
          name={copied ? 'check' : 'copy'}
          size={14}
          color={copied ? theme.colors.success : theme.colors.textSecondary}
        />
      </Pressable>
      <Pressable
        hitSlop={8}
        onPress={handleShare}
        style={({ pressed }) => [styles.agentActionButton, pressed && { opacity: 0.5, transform: [{ scale: 0.94 }] }]}
      >
        <Octicons name="share" size={14} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function getUsageLimitText(text: string): string | null {
  const trimmed = text.trim();
  if (!/^(You've|You have) hit your usage limit\./i.test(trimmed)) {
    return null;
  }

  const retryAt = trimmed.match(/try again at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (retryAt) {
    return t('message.usageLimitUntil', { time: retryAt[1].replace(/\s+/g, ' ') });
  }

  return t('message.usageLimitUntil', { time: t('message.unknownTime') });
}

function AgentEventBlock(props: {
  event: AgentEvent;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatLimitReachedTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function formatLimitReachedTime(timestamp: number): string {
  try {
    const date = new Date(timestamp * 1000); // Convert from Unix timestamp
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return t('message.unknownTime');
  }
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: layout.maxWidth,
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  agentActionsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    marginLeft: -6,
  },
  agentActionButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  toolContainer: {
    marginHorizontal: 8,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
}));
