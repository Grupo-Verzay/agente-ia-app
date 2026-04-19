type NodeDB = { id: string; order?: number; createdAt?: Date };
type EdgeDB = { sourceId: string; targetId: string };

export function buildLinearExecutionOrder(nodes: NodeDB[], edges: EdgeDB[]) {
    if (!nodes.length) return [];

    const nodeIds = new Set(nodes.map(n => n.id));

    // inDegree (cuántos entran a cada nodo)
    const inDegree = new Map<string, number>();
    for (const n of nodes) inDegree.set(n.id, 0);

    for (const e of edges) {
        if (!nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)) continue;
        inDegree.set(e.targetId, (inDegree.get(e.targetId) ?? 0) + 1);
    }

    // START: inDegree === 0
    const starts = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0);

    if (starts.length === 0) {
        throw new Error('Workflow inválido: no hay nodo inicial (posible ciclo).');
    }

    // Si por algún motivo hay más de un start (edges desconectados), elige uno con fallback
    const start = [...starts].sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        return ao - bo;
    })[0];

    // Siguiente por source (lineal: máximo 1 salida)
    const nextBySource = new Map<string, string>();
    for (const e of edges) nextBySource.set(e.sourceId, e.targetId);

    const visited = new Set<string>();
    const ordered: string[] = [];

    let current: string | undefined = start.id;

    while (current) {
        if (visited.has(current)) throw new Error('Workflow inválido: ciclo detectado.');
        visited.add(current);
        ordered.push(current);

        current = nextBySource.get(current);
    }

    return ordered; // lista de nodeIds en orden de ejecución
}