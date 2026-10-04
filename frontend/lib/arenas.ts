export type ArenaRoomSummary = {
    id: string;
    name: string;
    isPublic: boolean;
    joinToken: string;
    mapId: number;
    capacity: number;
    connectedPlayers: number;
    /** Jugadores en la sala (lobby), conectados o no a la partida. */
    memberCount?: number;
    owner: {
        _id: string;
        name: string;
    };
};

export type ArenaRoomMemberView = {
    accountId: string;
    name: string;
    isOwner: boolean;
    templateId: number | null;
    raceId: number | null;
    team: "blue" | "red";
    ready: boolean;
    connected: boolean;
};

export type ArenaRoomDetails = ArenaRoomSummary & {
    isOwner: boolean;
    member: {
        selectedPvpTemplateId: number | null;
        selectedPvpRaceId?: number | null;
        connected: boolean;
        team?: "blue" | "red" | null;
        ready?: boolean;
    } | null;
    members?: ArenaRoomMemberView[];
    /** true unos segundos después de que el dueño inició la partida. */
    launching?: boolean;
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
    { id: 5, name: "Druida" },
    { id: 6, name: "Paladin" },
    { id: 7, name: "Cazador" },
] as const;

/** Mapa base del modo MOBA (3v3, 3 carriles). */
export const MOBA_MAP_ID = 600;

/** Razas del MOBA y sus modificadores (server/src/balanceData.ts → balanceRazas; el servidor los aplica). */
export const MOBA_RACES = [
    { id: 1, name: "Humano", mods: "+1 Fuerza · +1 Agilidad · +2 Constitucion", note: "Equilibrado y resistente" },
    { id: 2, name: "Elfo", mods: "+2 Agilidad · +2 Inteligencia · +1 Const. · +1 Carisma", note: "Mas mana, algo menos de vida" },
    { id: 3, name: "Elfo Drow", mods: "+2 Fuerza · +1 Agilidad · +1 Int. · +1 Const.", note: "Fuerza y mana equilibrados" },
    { id: 4, name: "Enano", mods: "+3 Fuerza · +3 Constitucion · -3 Inteligencia", note: "El mas resistente, poco mana" },
    { id: 5, name: "Gnomo", mods: "+4 Inteligencia · +3 Agilidad · -2 Fuerza", note: "Mucho mana, poca vida" },
] as const;

/** Rol y kit de cada heroe en el MOBA (ver server/src/moba/heroes.ts). */
export const MOBA_HERO_ROLES: Record<number, { role: string; kit: string }> = {
    0: { role: "Mago · dano en rafaga", kit: "Apocalipsis, Descarga Electrica, Tormenta de Fuego, Inmovilizar, Celeridad" },
    1: { role: "Clerigo · sanador", kit: "Curar Heridas, Remover Paralisis, Paralizar, Inmovilizar, Fuerza, Celeridad" },
    2: { role: "Guerrero · tanque", kit: "Mas vida y golpes fuertes cuerpo a cuerpo (sin mana)" },
    3: { role: "Asesino · emboscada", kit: "Invisibilidad, Celeridad, Fuerza, Proyectil Magico, Inmovilizar" },
    4: { role: "Bardo · apoyo", kit: "Curar, Fuerza y Celeridad para el equipo, Inmovilizar, Tormenta de Fuego" },
    5: { role: "Druida · control", kit: "Paralizar, Inmovilizar, Curar Heridas Graves, Tormenta de Fuego" },
    6: { role: "Paladin · combatiente", kit: "Curar, Remover Paralisis, Inmovilizar, Proyectil Magico, Fuerza" },
    7: { role: "Cazador · tirador", kit: "Ataque a distancia con arco (sin mana)" },
};
