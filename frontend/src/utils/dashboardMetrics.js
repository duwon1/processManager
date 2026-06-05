const findMetric = (arr, id) => Array.isArray(arr) ? arr.find(d => d.id === id) : null;

export const parseNum = (arr, id) => {
    const metric = findMetric(arr, id);
    if (typeof metric?.rawValue === 'number') {
        return metric.rawValue;
    }
    const val = metric?.value ?? '0';
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

export const parseNetwork = (arr, id) => {
    const metric = findMetric(arr, id);
    // 에이전트가 bytes/sec 표준 숫자를 보내면 차트의 기존 KB/s 축에 맞춰 변환합니다.
    if (typeof metric?.rawValue === 'number' && metric?.unit === 'bytesPerSecond') {
        return metric.rawValue / 1024;
    }
    const val = metric?.value ?? '0';
    const n = parseFloat(val);
    if (isNaN(n)) return 0;
    const lower = val.toLowerCase();
    if (lower.includes('mb')) return n * 1024;
    return n; // kB
};

export const parseDiskDevices = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 15 || d?.key === 'disk.devices')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value) ? value : [];
};

export const parseNetworkInterfaces = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 16 || d?.key === 'network.interfaces')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value) ? value : [];
};

export const parseCpuLogicalProcessors = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 17 || d?.key === 'cpu.logicalProcessors')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value)
        ? value.map(item => Number(item)).map(item => Number.isFinite(item) ? item : 0)
        : [];
};

export const hasNodeAccess = (nodeAccess, key) => Boolean(nodeAccess?.owner || nodeAccess?.[key]);

const sameDisk = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        (left.device && right.device && left.device === right.device) ||
        (left.partitions && right.partitions && left.partitions === right.partitions) ||
        (left.mountpoint && right.mountpoint && left.mountpoint === right.mountpoint)
    );
};

export const buildDiskHistoryValues = (systemInfo, previousEntry = {}, liveDisks = []) => {
    const disks = Array.isArray(systemInfo?.disks) ? systemInfo.disks : [];
    return Object.fromEntries(disks.map((disk, index) => {
        const key = `disk_${index}`;
        const liveDisk = liveDisks.find(candidate => sameDisk(candidate, disk)) ?? liveDisks[index];
        const value = Number(liveDisk?.activeTimePercent ?? liveDisk?.usagePercent ?? disk?.activeTimePercent ?? disk?.usagePercent);
        const previous = Number(previousEntry?.[key]);
        return [key, Number.isFinite(value) ? value : (Number.isFinite(previous) ? previous : null)];
    }));
};

const sameNetwork = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        left.adapterName &&
        right.adapterName &&
        String(left.adapterName).toLowerCase() === String(right.adapterName).toLowerCase()
    );
};

export const buildNetworkHistoryValues = (systemInfo, previousEntry = {}, liveNetworks = []) => {
    const networks = Array.isArray(systemInfo?.networks) ? systemInfo.networks : [];
    return Object.fromEntries(networks.flatMap((network, index) => {
        const liveNetwork = liveNetworks.find(candidate => sameNetwork(candidate, network)) ?? liveNetworks[index];
        const sent = Number(liveNetwork?.sentBytesPerSecond);
        const recv = Number(liveNetwork?.receivedBytesPerSecond);
        const sentKey = `network_${index}_sent`;
        const recvKey = `network_${index}_recv`;
        const previousSent = Number(previousEntry?.[sentKey]);
        const previousRecv = Number(previousEntry?.[recvKey]);
        return [
            [sentKey, Number.isFinite(sent) ? sent / 1024 : (Number.isFinite(previousSent) ? previousSent : null)],
            [recvKey, Number.isFinite(recv) ? recv / 1024 : (Number.isFinite(previousRecv) ? previousRecv : null)],
        ];
    }));
};

export const fillMissingHistoryResourceValues = (history, systemInfo) => {
    if (!systemInfo || history.length === 0) return history;
    return history.map(entry => {
        const diskValues = buildDiskHistoryValues(systemInfo, entry);
        const networkValues = buildNetworkHistoryValues(systemInfo, entry);
        const missingDiskValues = Object.fromEntries(
            Object.entries(diskValues).filter(([key]) => entry[key] === undefined || entry[key] === null)
        );
        const missingNetworkValues = Object.fromEntries(
            Object.entries(networkValues).filter(([key]) => entry[key] === undefined || entry[key] === null)
        );
        return { ...entry, ...missingDiskValues, ...missingNetworkValues };
    });
};
