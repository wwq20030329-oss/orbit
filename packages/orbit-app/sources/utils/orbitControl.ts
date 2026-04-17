import type { Session } from '@/sync/storageTypes';
import type { SessionStatus } from './sessionStatus';
import { buildResumeCommandBlock } from './resumeCommand';
import { getCurrentLanguage } from '@/text';
import type { SupportedLanguage } from '@/text';

export type OrbitControlTone = 'green' | 'blue' | 'orange' | 'red' | 'gray';

export type OrbitControlTile = {
    key: 'link' | 'safety' | 'resume' | 'usage';
    label: string;
    value: string;
    detail: string;
    tone: OrbitControlTone;
};

function formatCompactNumber(value: number): string {
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return `${value}`;
}

type OrbitControlCopy = {
    panelTitle: string;
    linkLabel: string;
    safetyLabel: string;
    resumeLabel: string;
    usageLabel: string;
    attentionValue: string;
    attentionDetail: string;
    liveValue: string;
    liveWorkingDetail: string;
    liveReadyDetail: string;
    standbyValue: string;
    standbyDetail: string;
    offlineValue: string;
    offlineDetail: string;
    sandboxedValue: string;
    sandboxedDetail: string;
    yoloDetail: string;
    reviewValue: string;
    reviewDetail: string;
    attachedValue: string;
    attachedDetail: string;
    readyValue: string;
    readyDetail: string;
    unavailableValue: string;
    unavailableDetail: string;
    noDataValue: string;
    noDataDetail: string;
    usageContextPrefix: string;
};

const EN_ORBIT_CONTROL_COPY: OrbitControlCopy = {
    panelTitle: 'Orbit Control',
    linkLabel: 'Link',
    safetyLabel: 'Safety',
    resumeLabel: 'Resume',
    usageLabel: 'Usage',
    attentionValue: 'Attention',
    attentionDetail: 'Approval is blocking progress',
    liveValue: 'Live',
    liveWorkingDetail: 'Agent is actively working',
    liveReadyDetail: 'Ready for your next command',
    standbyValue: 'Standby',
    standbyDetail: 'Resume command is ready',
    offlineValue: 'Offline',
    offlineDetail: 'Reconnect from the original machine',
    sandboxedValue: 'Sandboxed',
    sandboxedDetail: 'Workspace guardrails are active',
    yoloDetail: 'Direct execution is enabled',
    reviewValue: 'Review',
    reviewDetail: 'Approvals stay on-device',
    attachedValue: 'Attached',
    attachedDetail: 'This session is already live',
    readyValue: 'Ready',
    readyDetail: '1-tap command handoff',
    unavailableValue: 'Unavailable',
    unavailableDetail: 'No resumable runtime found',
    noDataValue: 'No data',
    noDataDetail: 'No token snapshot yet',
    usageContextPrefix: 'ctx',
};

const ZH_HANS_ORBIT_CONTROL_COPY: OrbitControlCopy = {
    panelTitle: 'Orbit 控制',
    linkLabel: '连接',
    safetyLabel: '安全',
    resumeLabel: '恢复',
    usageLabel: '用量',
    attentionValue: '需处理',
    attentionDetail: '授权请求阻塞了进度',
    liveValue: '在线',
    liveWorkingDetail: 'Agent 正在执行任务',
    liveReadyDetail: '已准备好接收下一条命令',
    standbyValue: '待命',
    standbyDetail: '恢复命令已就绪',
    offlineValue: '离线',
    offlineDetail: '请在原设备上重新连接',
    sandboxedValue: '沙箱中',
    sandboxedDetail: '工作区保护已开启',
    yoloDetail: '已启用直接执行',
    reviewValue: '审查',
    reviewDetail: '审批保留在本机设备上',
    attachedValue: '已附着',
    attachedDetail: '该会话已处于在线状态',
    readyValue: '可恢复',
    readyDetail: '可一键接力继续',
    unavailableValue: '不可用',
    unavailableDetail: '未找到可恢复的运行时',
    noDataValue: '暂无数据',
    noDataDetail: '还没有 token 快照',
    usageContextPrefix: '上下文',
};

const ZH_HANT_ORBIT_CONTROL_COPY: OrbitControlCopy = {
    panelTitle: 'Orbit 控制',
    linkLabel: '連線',
    safetyLabel: '安全',
    resumeLabel: '恢復',
    usageLabel: '用量',
    attentionValue: '需處理',
    attentionDetail: '授權請求阻塞了進度',
    liveValue: '在線',
    liveWorkingDetail: 'Agent 正在執行任務',
    liveReadyDetail: '已準備好接收下一條命令',
    standbyValue: '待命',
    standbyDetail: '恢復命令已就緒',
    offlineValue: '離線',
    offlineDetail: '請在原設備上重新連線',
    sandboxedValue: '沙箱中',
    sandboxedDetail: '工作區保護已開啟',
    yoloDetail: '已啟用直接執行',
    reviewValue: '審查',
    reviewDetail: '審批保留在本機裝置上',
    attachedValue: '已附著',
    attachedDetail: '該會話已處於在線狀態',
    readyValue: '可恢復',
    readyDetail: '可一鍵接力繼續',
    unavailableValue: '不可用',
    unavailableDetail: '未找到可恢復的執行階段',
    noDataValue: '暫無資料',
    noDataDetail: '還沒有 token 快照',
    usageContextPrefix: '上下文',
};

function getOrbitControlCopy(language: SupportedLanguage = getCurrentLanguage()): OrbitControlCopy {
    if (language === 'zh-Hans') {
        return ZH_HANS_ORBIT_CONTROL_COPY;
    }

    if (language === 'zh-Hant') {
        return ZH_HANT_ORBIT_CONTROL_COPY;
    }

    return EN_ORBIT_CONTROL_COPY;
}

export function getOrbitControlPanelTitle(): string {
    return getOrbitControlCopy().panelTitle;
}

function getLinkTile(session: Session, status: SessionStatus): OrbitControlTile {
    const copy = getOrbitControlCopy();
    const resumeBlock = buildResumeCommandBlock(session.metadata ?? {});

    if (status.state === 'permission_required') {
        return {
            key: 'link',
            label: copy.linkLabel,
            value: copy.attentionValue,
            detail: copy.attentionDetail,
            tone: 'orange',
        };
    }

    if (status.isConnected && status.state === 'thinking') {
        return {
            key: 'link',
            label: copy.linkLabel,
            value: copy.liveValue,
            detail: copy.liveWorkingDetail,
            tone: 'blue',
        };
    }

    if (status.isConnected) {
        return {
            key: 'link',
            label: copy.linkLabel,
            value: copy.liveValue,
            detail: copy.liveReadyDetail,
            tone: 'green',
        };
    }

    if (resumeBlock) {
        return {
            key: 'link',
            label: copy.linkLabel,
            value: copy.standbyValue,
            detail: copy.standbyDetail,
            tone: 'gray',
        };
    }

    return {
        key: 'link',
        label: copy.linkLabel,
        value: copy.offlineValue,
        detail: copy.offlineDetail,
        tone: 'gray',
    };
}

function getSafetyTile(session: Session): OrbitControlTile {
    const copy = getOrbitControlCopy();
    const sandbox = session.metadata?.sandbox;
    const skipPermissions = session.metadata?.dangerouslySkipPermissions === true
        || session.permissionMode === 'bypassPermissions'
        || session.permissionMode === 'yolo';

    if (sandbox && typeof sandbox === 'object' && (sandbox as Record<string, unknown>).enabled !== false) {
        return {
            key: 'safety',
            label: copy.safetyLabel,
            value: copy.sandboxedValue,
            detail: copy.sandboxedDetail,
            tone: 'green',
        };
    }

    if (skipPermissions) {
        return {
            key: 'safety',
            label: copy.safetyLabel,
            value: 'YOLO',
            detail: copy.yoloDetail,
            tone: 'red',
        };
    }

    return {
        key: 'safety',
        label: copy.safetyLabel,
        value: copy.reviewValue,
        detail: copy.reviewDetail,
        tone: 'green',
    };
}

function getResumeTile(session: Session, status: SessionStatus): OrbitControlTile {
    const copy = getOrbitControlCopy();
    const resumeBlock = buildResumeCommandBlock(session.metadata ?? {});

    if (status.isConnected) {
        return {
            key: 'resume',
            label: copy.resumeLabel,
            value: copy.attachedValue,
            detail: copy.attachedDetail,
            tone: 'blue',
        };
    }

    if (resumeBlock) {
        return {
            key: 'resume',
            label: copy.resumeLabel,
            value: copy.readyValue,
            detail: copy.readyDetail,
            tone: 'green',
        };
    }

    return {
        key: 'resume',
        label: copy.resumeLabel,
        value: copy.unavailableValue,
        detail: copy.unavailableDetail,
        tone: 'gray',
    };
}

function getUsageTile(session: Session): OrbitControlTile {
    const copy = getOrbitControlCopy();
    const usage = session.latestUsage;

    if (!usage) {
        return {
            key: 'usage',
            label: copy.usageLabel,
            value: copy.noDataValue,
            detail: copy.noDataDetail,
            tone: 'gray',
        };
    }

    const total = usage.inputTokens + usage.outputTokens + usage.cacheCreation + usage.cacheRead;
    return {
        key: 'usage',
        label: copy.usageLabel,
        value: formatCompactNumber(total),
        detail: `${copy.usageContextPrefix} ${formatCompactNumber(usage.contextSize)}`,
        tone: 'blue',
    };
}

export function getOrbitControlTiles(session: Session, status: SessionStatus): OrbitControlTile[] {
    return [
        getLinkTile(session, status),
        getSafetyTile(session),
        getResumeTile(session, status),
        getUsageTile(session),
    ];
}
