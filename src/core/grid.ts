export interface GridItem {
  x: number;
  y: number;
  r: number;
}

/** Uniform-grid spatial hash, rebuilt every tick. Small arenas → flat arrays are fastest. */
export class SpatialGrid<T extends GridItem> {
  private cells: T[][] = [];
  private cols = 1;
  private rows = 1;

  constructor(
    private width: number,
    private height: number,
    private cell = 64,
  ) {
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.cols = Math.max(1, Math.ceil(width / this.cell) + 2);
    this.rows = Math.max(1, Math.ceil(height / this.cell) + 2);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private cx(x: number): number {
    const c = Math.floor(x / this.cell) + 1;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cy(y: number): number {
    const c = Math.floor(y / this.cell) + 1;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  insert(item: T): void {
    const x0 = this.cx(item.x - item.r);
    const x1 = this.cx(item.x + item.r);
    const y0 = this.cy(item.y - item.r);
    const y1 = this.cy(item.y + item.r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.cells[y * this.cols + x].push(item);
  }

  /** Collects unique items whose cells overlap the query circle into `out`. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = this.cx(x - r);
    const x1 = this.cx(x + r);
    const y0 = this.cy(y - r);
    const y1 = this.cy(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const it of this.cells[cy * this.cols + cx]) if (!out.includes(it)) out.push(it);
      }
    }
    return out;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
