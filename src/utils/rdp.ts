export interface ParsedRdpQuickConnect {
    host: string
    port: number
    username?: string
}

const DEFAULT_RDP_PORT = 3389

export function parseRdpQuickConnect (query: string): ParsedRdpQuickConnect {
    let target = query.replace(/[\r\n]+/g, '').trim()
    if (/^rdp:\/\//i.test(target)) {
        target = target.slice(6)
    }

    let username: string | undefined
    const at = target.lastIndexOf('@')
    if (at >= 0) {
        username = decodePart(target.slice(0, at)) || undefined
        target = target.slice(at + 1)
    }

    let host = target
    let port = DEFAULT_RDP_PORT

    if (target.startsWith('[')) {
        const closingBracket = target.indexOf(']')
        if (closingBracket > 0) {
            host = target.slice(1, closingBracket)
            const suffix = target.slice(closingBracket + 1)
            if (suffix.startsWith(':')) {
                port = parsePort(suffix.slice(1))
            }
        }
    } else if ((target.match(/:/g) || []).length === 1) {
        const separator = target.lastIndexOf(':')
        host = target.slice(0, separator)
        port = parsePort(target.slice(separator + 1))
    }

    return {
        host: decodePart(host).trim(),
        port,
        username,
    }
}

export function formatRdpAddress (host: string, port: number): string {
    const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
    return `${normalizedHost}:${port || DEFAULT_RDP_PORT}`
}

function parsePort (value: string): number {
    if (!/^\d+$/.test(value)) return DEFAULT_RDP_PORT
    const port = Number(value)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_RDP_PORT
}

function decodePart (value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
