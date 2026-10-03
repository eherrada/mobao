type DebugCombatOverlayProps = {
    enabled: boolean;
    text: string;
};

export function DebugCombatOverlay({ enabled, text }: DebugCombatOverlayProps) {
    if (!enabled || !text) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute left-2 top-14 z-20 rounded border border-sky-300/40 bg-black/65 px-2 py-1 text-[11px] leading-4 text-sky-200 shadow-lg">
            <pre className="whitespace-pre-wrap">{text}</pre>
        </div>
    );
}
