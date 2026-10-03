import { useCallback, useEffect, useState, type RefObject } from "react";
import { createDialogPacket } from "../../../lib/aowProtocol";
import {
    isAdminInspector,
    type InspectableNpc,
    type RevivableCharacter,
} from "../admin/npcInspector";
import type { Engine } from "../engine/Engine";

type UseNpcAdminToolsOptions = {
    websocketRef: RefObject<WebSocket | null>;
    engineRef: RefObject<Engine | null>;
    playerHudRef: RefObject<any>;
    npcContextMenuRef: RefObject<HTMLDivElement | null>;
    npcContextMenuOpenedAtRef: RefObject<number>;
    connectionSessionKey?: string;
};

export function useNpcAdminTools({
    websocketRef,
    engineRef,
    playerHudRef,
    npcContextMenuRef,
    npcContextMenuOpenedAtRef,
    connectionSessionKey,
}: UseNpcAdminToolsOptions) {
    const [npcContextMenu, setNpcContextMenu] = useState<{
        x: number;
        y: number;
        npc: InspectableNpc;
    } | null>(null);
    const [deadCharacterContextMenu, setDeadCharacterContextMenu] = useState<{
        x: number;
        y: number;
        character: RevivableCharacter;
    } | null>(null);
    const [inspectedNpc, setInspectedNpc] = useState<InspectableNpc | null>(
        null,
    );
    const [removingNpcEntityId, setRemovingNpcEntityId] = useState<
        number | null
    >(null);

    useEffect(() => {
        if (!npcContextMenu && !deadCharacterContextMenu && !inspectedNpc) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (event.timeStamp <= npcContextMenuOpenedAtRef.current + 32) {
                return;
            }

            if (
                npcContextMenuRef.current &&
                event.target instanceof Node &&
                npcContextMenuRef.current.contains(event.target)
            ) {
                return;
            }

            setNpcContextMenu(null);
            setDeadCharacterContextMenu(null);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }

            if (npcContextMenu) {
                setNpcContextMenu(null);
                return;
            }

            if (deadCharacterContextMenu) {
                setDeadCharacterContextMenu(null);
                return;
            }

            setInspectedNpc(null);
        };

        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        deadCharacterContextMenu,
        inspectedNpc,
        npcContextMenu,
        npcContextMenuOpenedAtRef,
        npcContextMenuRef,
    ]);

    useEffect(() => {
        setNpcContextMenu(null);
        setDeadCharacterContextMenu(null);
        setInspectedNpc(null);
        setRemovingNpcEntityId(null);
    }, [connectionSessionKey]);

    const reviveCharacter = useCallback(
        (character: RevivableCharacter) => {
            const socket = websocketRef.current;
            const engine = engineRef.current;

            if (
                !socket ||
                socket.readyState !== WebSocket.OPEN ||
                !isAdminInspector(engine, playerHudRef.current)
            ) {
                return false;
            }

            socket.send(createDialogPacket(`/revivir ${character.name}`));
            setDeadCharacterContextMenu(null);
            setNpcContextMenu(null);
            setInspectedNpc(null);
            return true;
        },
        [engineRef, playerHudRef, websocketRef],
    );

    const removeNpcFromMap = useCallback(
        (npc: InspectableNpc) => {
            const socket = websocketRef.current;
            const engine = engineRef.current;

            if (
                !socket ||
                socket.readyState !== WebSocket.OPEN ||
                !isAdminInspector(engine, playerHudRef.current)
            ) {
                return false;
            }

            setRemovingNpcEntityId(npc.entityId);
            socket.send(createDialogPacket(`/quitarnpc ${npc.entityId}`));
            setNpcContextMenu(null);
            setInspectedNpc(null);

            window.setTimeout(() => {
                setRemovingNpcEntityId((current) =>
                    current === npc.entityId ? null : current,
                );
            }, 400);

            return true;
        },
        [engineRef, playerHudRef, websocketRef],
    );

    const removeNpcFromMapPermanently = useCallback(
        (npc: InspectableNpc) => {
            const socket = websocketRef.current;
            const engine = engineRef.current;

            if (
                !socket ||
                socket.readyState !== WebSocket.OPEN ||
                !isAdminInspector(engine, playerHudRef.current)
            ) {
                return false;
            }

            setRemovingNpcEntityId(npc.entityId);
            socket.send(
                createDialogPacket(`/quitarnpcpermanente ${npc.entityId}`),
            );
            setNpcContextMenu(null);
            setInspectedNpc(null);

            window.setTimeout(() => {
                setRemovingNpcEntityId((current) =>
                    current === npc.entityId ? null : current,
                );
            }, 400);

            return true;
        },
        [engineRef, playerHudRef, websocketRef],
    );

    return {
        deadCharacterContextMenu,
        inspectedNpc,
        npcContextMenu,
        removeNpcFromMap,
        removeNpcFromMapPermanently,
        removingNpcEntityId,
        reviveCharacter,
        setDeadCharacterContextMenu,
        setInspectedNpc,
        setNpcContextMenu,
    };
}
