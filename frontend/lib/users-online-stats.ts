export type UserOnlineStat = {
    sampledMinute: string;
    totalUsers: number;
    pveUsers: number;
    pvpUsers: number;
    fishingUsers: number;
    miningUsers: number;
    woodcuttingUsers: number;
    createdAt: string;
};

export type UserOnlineStatsResponse = {
    stats: UserOnlineStat[];
};
