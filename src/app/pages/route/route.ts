import { Component, ElementRef, ViewChild, AfterViewInit, computed, effect, inject, signal } from '@angular/core';
import { Api, CustomerRow, OrderRow, firstName } from '../../core/api';
import { LIMIT_MIN, SPEED_KMH, START_MIN, Trip, baht, candidates, clock, jobCode, signed, FOOD_COST, PRICE } from '../../core/planner';
import { Store } from '../../core/store';
import { around, baseLayer, esc, makeMap, ok } from '../../core/map';
declare const L: any;

@Component({
  selector: 'app-route',
  standalone: true,
  template: `
    <section class="card">
      <div class="bar">
        <button class="btn" (click)="build()" [disabled]="loading()">🪄 จัดเส้นทางใหม่ทั้งหมด</button>
        <button class="btn ghost" (click)="next()" [disabled]="cand().length < 2">🔄 คำนวณใหม่ / ดูเส้นทางอื่น</button>
        @if (cand().length) { <span class="muted">ทางเลือกที่ {{ idx() + 1 }}/{{ cand().length }}</span> }
      </div>
      @if (error()) { <p class="err">{{ error() }}</p> }
      @if (loading()) { <p class="muted">กำลังโหลดออเดอร์... Render แบบฟรีอาจใช้เวลาปลุกเซิร์ฟเวอร์ประมาณ 1 นาที</p> }
      @if (!loading() && !error() && !trips().length) { <p class="muted">ยังไม่มีออเดอร์ให้จัดเส้นทาง ไปหน้า "ออเดอร์" แล้วกด "สุ่มออเดอร์จำลอง"</p> }
      @if (trips().length) {
        <div class="kpis">
          <div class="kpi"><span>ยอดขาย</span><b>{{ baht(s().sales) }}</b></div>
          <div class="kpi"><span>ต้นทุนอาหาร</span><b>{{ baht(s().food) }}</b></div>
          <div class="kpi"><span>ค่าส่งไรเดอร์</span><b>{{ baht(s().fee) }}</b></div>
          <div class="kpi" [class.good]="s().profit >= 0" [class.bad]="s().profit < 0"><span>กำไร / ขาดทุน</span><b>{{ signed(s().profit) }}</b></div>
          <div class="kpi"><span>ไรเดอร์</span><b>{{ s().riders }} คน</b></div>
          <div class="kpi"><span>ระยะทางรวม</span><b>{{ s().km.toFixed(1) }} กม.</b></div>
          <div class="kpi" [class.good]="!s().late" [class.bad]="s().late > 0"><span>ถึงคนสุดท้าย</span><b>{{ clock(s().last) }} น.</b></div>
        </div>
        @if (s().late) { <p class="err">⚠️ มี {{ s().late }} คนที่ถึงหลัง 12:30 น. กด "คำนวณใหม่ / ดูเส้นทางอื่น"</p> }
        @else { <p class="okmsg">✅ ทุกจุดถึงก่อน 12:30 น. (ออกเดินทาง {{ clock(0) }} น., {{ speed }} กม./ชม.)</p> }
        @if (s().profit < 0) { <p class="err">แผนนี้ขาดทุน กด "คำนวณใหม่ / ดูเส้นทางอื่น" เพื่อลองแผนอื่น</p> }
      }
    </section>
    <div class="grid2 route">
      <div class="map" #mapEl></div>
      <aside class="card">
        <h2>เส้นทางไรเดอร์แต่ละคน</h2>
        <div class="scroll tall">
          @for (t of trips(); track t.id) {
            <article class="rt" [class.late]="t.late" (click)="focus(t)">
              <p class="rt-h"><i class="dot" [style.background]="t.color"></i><b>ไรเดอร์ {{ t.id }} · {{ code(t.id) }}</b></p>
              <p>@for (s of t.stops; track s.id; let i = $index) { @if (i) { → } {{ i + 1 }}) {{ first(s.name) }} ({{ s.qty }}) }</p>
              <small>{{ t.boxes }} กล่อง · {{ t.km.toFixed(1) }} กม. · ค่าส่ง {{ baht(t.fee) }} · ถึง {{ clock(t.arrive[t.arrive.length - 1]) }} น.</small>
            </article>
          }
        </div>
      </aside>
    </div>`,
})
export class Route implements AfterViewInit {
  private api = inject(Api); private store = inject(Store);
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLElement>;
  baht = baht; signed = signed; clock = clock; code = jobCode; first = firstName; speed = SPEED_KMH;
  orders = signal<OrderRow[]>([]); customers = signal<CustomerRow[]>([]);
  cand = signal<Trip[][]>([]); idx = signal(0); loading = signal(true); error = signal('');
  trips = computed(() => this.cand()[this.idx()] ?? []);
  s = computed(() => {
    const t = this.trips(), boxes = t.reduce((a, x) => a + x.boxes, 0), fee = t.reduce((a, x) => a + x.fee, 0);
    return {
      sales: boxes * PRICE, food: boxes * FOOD_COST, fee, profit: boxes * (PRICE - FOOD_COST) - fee, riders: t.length,
      km: t.reduce((a, x) => a + x.km, 0), late: t.filter(x => x.late).length,
      last: t.length ? Math.max(...t.map(x => x.arrive[x.arrive.length - 1])) : 0,
    };
  });
  private map: any; private layer: any;

  constructor() { effect(() => { this.trips(); this.customers(); this.store.shop(); this.draw(); }); }

  ngAfterViewInit() {
    this.map = makeMap(this.mapEl.nativeElement, this.store.shop());
    this.layer = L.layerGroup().addTo(this.map);
    this.draw();
    this.api.customers().subscribe({ next: r => this.customers.set(r), error: () => { /* จุดเทาไม่แสดง แต่เส้นทางยังใช้ได้ */ } });
    this.api.orders().subscribe({
      next: r => { this.orders.set(r); this.loading.set(false); this.build(); },
      error: () => { this.loading.set(false); this.error.set('โหลดออเดอร์ไม่ได้ ตรวจว่า API บน Render ยังทำงานอยู่ แล้วรีเฟรชหน้านี้'); },
    });
  }

  build() {
    const list = this.orders().filter(o => ok(o.lat, o.lng));
    this.cand.set(list.length ? candidates(list, this.store.shop()) : []);
    this.show(0);
  }
  next() { if (this.cand().length) this.show((this.idx() + 1) % this.cand().length); }
  private show(i: number) { this.idx.set(i); this.store.setJobs(this.trips()); } // ใบงานของไรเดอร์ = แผนที่แสดงอยู่ตอนนี้

  private draw() {
    if (!this.layer) return;
    const shop = this.store.shop(), t = this.trips(), all: number[][] = [[shop.lat, shop.lng]];
    this.layer.clearLayers();
    baseLayer(shop).addTo(this.layer);
    const used = new Set(t.flatMap(x => x.stops.map(o => o.customer_id)));
    for (const c of this.customers()) {
      if (used.has(c.customer_id) || !ok(+c.latitude, +c.longitude)) continue;
      L.circleMarker([+c.latitude, +c.longitude], { radius: 3.5, color: '#9ca3af', weight: 0, fillOpacity: .9, interactive: false }).addTo(this.layer);
    }
    for (const x of t) {
      L.polyline([[shop.lat, shop.lng], ...x.stops.map(o => [o.lat, o.lng])], { color: x.color, weight: 3, opacity: .9 }).addTo(this.layer);
      x.stops.forEach((o, i) => {
        all.push([o.lat, o.lng]);
        L.marker([o.lat, o.lng], { icon: L.divIcon({ className: 'np', html: `<i style="background:${x.color}">${i + 1}</i>`, iconSize: [20, 20], iconAnchor: [10, 10] }) })
          .bindTooltip(`${esc(firstName(o.name))} (${o.qty} กล่อง)`).addTo(this.layer);
      });
    }
    this.map.fitBounds(t.length ? all : around(shop), { padding: [24, 24] });
  }

  focus(t: Trip) { const s = this.store.shop(); this.map.fitBounds([[s.lat, s.lng], ...t.stops.map(o => [o.lat, o.lng])], { padding: [60, 60] }); }
}
