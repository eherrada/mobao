export type AuthCharacterSummary = {
    _id: string;
    name: string;
    level: number;
    map: number;
    className: string;
    raceName: string;
    isAdministrator: boolean;
    criminal: boolean;
    faction: "none" | "armada" | "caos";
    clanName: string | null;
    id_head: number;
    id_body: number;
    id_weapon: number;
    id_shield: number;
    id_helmet: number;
};

export type AuthSession = {
    account: {
        _id: string;
        name: string;
        email: string;
    };
    characters: AuthCharacterSummary[];
    selectedCharacterId: string | null;
};

export type AuthErrorResponse = {
    error: string;
};

export type PasswordResetStatus = {
    valid: boolean;
};

export type PasswordResetResponse = {
    message: string;
};
