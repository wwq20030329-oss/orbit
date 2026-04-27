import { Linking } from 'react-native';
import { Modal } from '@/modal';
import { AudioModule } from 'expo-audio';
import { t } from '@/text';

export interface MicrophonePermissionResult {
  granted: boolean;
  canAskAgain?: boolean;
}

/**
 * CRITICAL: Request microphone permissions BEFORE starting any audio session
 * Without this, first voice session WILL fail on iOS/Android
 *
 * Uses expo-audio (SDK 52+) - expo-av is deprecated
 */
export async function requestMicrophonePermission(): Promise<MicrophonePermissionResult> {
  try {
    const result = await AudioModule.requestRecordingPermissionsAsync();

    if (result.granted) {
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      return { granted: true, canAskAgain: result.canAskAgain };
    }

    return { granted: false, canAskAgain: result.canAskAgain };
  } catch (error) {
    console.error('Error requesting microphone permission:', error);
    return { granted: false };
  }
}

/**
 * Check current microphone permission status without prompting
 */
export async function checkMicrophonePermission(): Promise<MicrophonePermissionResult> {
  try {
    const result = await AudioModule.getRecordingPermissionsAsync();
    return { granted: result.granted, canAskAgain: result.canAskAgain };
  } catch (error) {
    console.error('Error checking microphone permission:', error);
    return { granted: false };
  }
}

/**
 * Show appropriate error message when permission is denied
 */
export function showMicrophonePermissionDeniedAlert(canAskAgain: boolean = false) {
  const title = t('voicePermissions.accessRequiredTitle');
  const message = canAskAgain
    ? t('voicePermissions.grantPrompt')
    : t('voicePermissions.openSettingsPrompt');

  Modal.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('common.openSettings'),
      onPress: () => {
        Linking.openSettings();
      }
    }
  ]);
}
