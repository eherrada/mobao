export type ArenaRoomSummary = {
    id: string;
    name: string;
    isPublic: boolean;
    joinToken: string;
    mapId: number;
    capacity: number;
    connectedPlayers: number;
    owner: {
        _id: string;
        name: string;
    };
};

export type ArenaRoomDetails = ArenaRoomSummary & {
    isOwner: boolean;
    member: {
        selectedPvpTemplateId: number | null;
        connected: boolean;
    } | null;
};

export type ArenaRoomsResponse = {
    rooms: ArenaRoomSummary[];
};

export type ArenaGameTicketResponse = {
    ticket: string;
    expiresAt: string;
};

export const PVP_CHARACTER_TEMPLATES = [
    { id: 0, name: "Mago" },
    { id: 1, name: "Clerigo" },
    { id: 2, name: "Guerrero" },
    { id: 3, name: "Asesino" },
    { id: 4, name: "Bardo" },
    { id: 5, name: "Paladin" },
    { id: 6, name: "Cazador" },
] as const;
