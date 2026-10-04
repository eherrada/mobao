export {};

export type Team = "blue" | "red";

type TeamHolder = { mobaTeam?: Team | string; team?: Team | string; mobaMatchId?: string } | undefined | null;

/** Equipo de un heroe (mobaTeam) o de una estructura/minion (team). */
function teamOf(entity: TeamHolder): Team | undefined {
    const raw = entity?.mobaTeam ?? entity?.team;
    return raw === "blue" || raw === "red" ? raw : undefined;
}

function areEnemies(a: TeamHolder, b: TeamHolder): boolean {
    const ta = teamOf(a);
    const tb = teamOf(b);
    return Boolean(ta && tb && ta !== tb);
}

function areAllies(a: TeamHolder, b: TeamHolder): boolean {
    const ta = teamOf(a);
    const tb = teamOf(b);
    return Boolean(ta && tb && ta === tb);
}

function opposite(team: Team): Team {
    return team === "blue" ? "red" : "blue";
}

module.exports = { teamOf, areEnemies, areAllies, opposite };
