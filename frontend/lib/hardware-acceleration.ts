export type BrowserHardwareAccelerationHelp = {
    browserLabel: string;
    steps: string[];
};

export type HardwareAccelerationDiagnostics = {
    enabled: boolean | null;
    renderer: string | null;
    details: string | null;
    browserHelp: BrowserHardwareAccelerationHelp | null;
};

const SOFTWARE_RENDERER_PATTERN =
    /swiftshader|llvmpipe|softpipe|software rasterizer|software|basic render/i;

export function getBrowserHardwareAccelerationHelp(
    userAgent: string,
): BrowserHardwareAccelerationHelp | null {
    const normalizedUserAgent = userAgent.toLowerCase();

    if (/android|iphone|ipad|ipod|mobile/.test(normalizedUserAgent)) {
        return null;
    }

    if (/firefox\//.test(normalizedUserAgent)) {
        return {
            browserLabel: "Firefox",
            steps: [
                "Abrí Configuración > General > Rendimiento.",
                "Desactivá 'Usar la configuración de rendimiento recomendada' si hace falta.",
                "Activá 'Usar aceleración de hardware cuando esté disponible' y reiniciá Firefox.",
            ],
        };
    }

    if (/edg\//.test(normalizedUserAgent)) {
        return {
            browserLabel: "Edge",
            steps: [
                "Abrí Configuración > Sistema y rendimiento.",
                "Activá 'Usar aceleración de gráficos cuando esté disponible'.",
                "Reiniciá Edge para aplicar el cambio.",
            ],
        };
    }

    if (
        /opr\//.test(normalizedUserAgent) ||
        /opera\//.test(normalizedUserAgent)
    ) {
        return {
            browserLabel: "Opera",
            steps: [
                "Abrí Configuración > Avanzado > Sistema.",
                "Activá 'Usar aceleración de hardware cuando esté disponible'.",
                "Reiniciá Opera para aplicar el cambio.",
            ],
        };
    }

    if (
        /chrome\//.test(normalizedUserAgent) ||
        /chromium\//.test(normalizedUserAgent)
    ) {
        return {
            browserLabel: "Chrome o un navegador compatible",
            steps: [
                "Abrí Configuración > Sistema.",
                "Activá 'Usar aceleración gráfica cuando esté disponible'.",
                "Reiniciá el navegador para aplicar el cambio.",
            ],
        };
    }

    return {
        browserLabel: "tu navegador",
        steps: [
            "Abrí la configuración del navegador.",
            "Buscá 'aceleración por hardware' o 'graphics acceleration' y activala.",
            "Reiniciá el navegador para aplicar el cambio.",
        ],
    };
}

function getWebGlContext(
    canvas: HTMLCanvasElement,
    attributes?: WebGLContextAttributes,
): WebGLRenderingContext | null {
    return (
        (canvas.getContext(
            "webgl",
            attributes,
        ) as WebGLRenderingContext | null) ??
        (canvas.getContext(
            "experimental-webgl",
            attributes,
        ) as WebGLRenderingContext | null)
    );
}

export function detectHardwareAccelerationDiagnostics(): HardwareAccelerationDiagnostics {
    if (typeof window === "undefined") {
        return {
            enabled: null,
            renderer: null,
            details: null,
            browserHelp: null,
        };
    }

    const browserHelp = getBrowserHardwareAccelerationHelp(
        window.navigator.userAgent,
    );

    if (!browserHelp) {
        return {
            enabled: null,
            renderer: null,
            details: null,
            browserHelp: null,
        };
    }

    const canvas = document.createElement("canvas");
    const preferredContext = getWebGlContext(canvas, {
        failIfMajorPerformanceCaveat: true,
    });
    const fallbackContext = preferredContext ?? getWebGlContext(canvas);

    if (!fallbackContext) {
        return {
            enabled: false,
            renderer: null,
            details:
                "El navegador no pudo iniciar WebGL para el render del juego.",
            browserHelp,
        };
    }

    let renderer = "";

    try {
        const debugInfo = fallbackContext.getExtension(
            "WEBGL_debug_renderer_info",
        );
        const rawRenderer = debugInfo
            ? fallbackContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : fallbackContext.getParameter(fallbackContext.RENDERER);

        renderer = typeof rawRenderer === "string" ? rawRenderer : "";
    } catch {
        renderer = "";
    }

    if (!preferredContext) {
        return {
            enabled: false,
            renderer: renderer || null,
            details:
                "El navegador está usando una ruta gráfica degradada y puede perder FPS o fluidez.",
            browserHelp,
        };
    }

    if (renderer && SOFTWARE_RENDERER_PATTERN.test(renderer)) {
        return {
            enabled: false,
            renderer,
            details: `El navegador está renderizando con ${renderer}.`,
            browserHelp,
        };
    }

    return {
        enabled: true,
        renderer: renderer || null,
        details: null,
        browserHelp,
    };
}
