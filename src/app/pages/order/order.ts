import { Component, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Api, CustomerRow, OrderRow, fullName } from '../../core/api';
import { FOOD_COST, MAX_ORDERS, PRICE, baht } from '../../core/planner';

@Component({
  selector: 'app-order',
  standalone: true,
  template: `
    <div class="grid2 orders">
      <section class="card">
        <h2>จัดการออเดอร์ / จำลองการสั่งซื้อ</h2>
        @if (error()) { <p class="err">{{ error() }}</p> }
        @if (loading()) { <p class="muted">กำลังโหลด... Render แบบฟรีอาจใช้เวลาปลุกเซิร์ฟเวอร์ประมาณ 1 นาที</p> }
        <div class="form-row">
          <select class="grow" (change)="cid.set(+$any($event.target).value)">
            @for (c of customers(); track c.customer_id) { <option [value]="c.customer_id" [selected]="c.customer_id === cid()">{{ nm(c) }}</option> }
          </select>
          <select class="qty" (change)="qty.set(+$any($event.target).value)">
            @for (n of opts; track n) { <option [value]="n" [selected]="n === qty()">{{ n }}</option> }
          </select>
          <button class="btn" (click)="add()" [disabled]="!cid() || busy()">+ เพิ่มออเดอร์</button>
        </div>
        <div class="form-row">
          <button class="btn ghost" (click)="seed()" [disabled]="busy()">🎲 สุ่มออเดอร์จำลอง (20–30)</button>
          <button class="btn ghost" (click)="clear()" [disabled]="busy() || !rows().length">ล้างทั้งหมด</button>
        </div>
        <p class="hint">ออเดอร์ละไม่เกิน {{ max }} กล่อง · ราคา {{ price }} บาท/กล่อง · ต้นทุน {{ cost }} บาท/กล่อง</p>
      </section>
      <section class="card">
        <div class="kpis">
          <div class="kpi"><span>ออเดอร์</span><b>{{ rows().length }}</b></div>
          <div class="kpi"><span>ข้าวกล่อง</span><b>{{ boxes() }}</b></div>
          <div class="kpi"><span>ยอดขาย</span><b>{{ baht(boxes() * price) }}</b></div>
          <div class="kpi"><span>ไรเดอร์ที่ต้องใช้</span><b>{{ riders() }}</b></div>
        </div>
        <div class="scroll tall">
          <table>
            <thead><tr><th>#</th><th>ลูกค้า</th><th>กล่อง</th><th></th></tr></thead>
            <tbody>
              @for (o of rows(); track o.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td><td>{{ o.name }}</td>
                  <td>
                    <select class="mini" (change)="setQty(o, +$any($event.target).value)">
                      @for (n of opts; track n) { <option [value]="n" [selected]="n === o.qty">{{ n }}</option> }
                    </select>
                  </td>
                  <td><button class="x" (click)="remove(o)" title="ลบออเดอร์">✕</button></td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="4" class="muted">ยังไม่มีออเดอร์ กด "สุ่มออเดอร์จำลอง" เพื่อเริ่มทดสอบ</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>`,
})
export class Order {
  private api = inject(Api);
  nm = fullName; baht = baht; max = MAX_ORDERS; price = PRICE; cost = FOOD_COST; opts = [1, 2, 3];
  rows = signal<OrderRow[]>([]); customers = signal<CustomerRow[]>([]);
  cid = signal(0); qty = signal(1); loading = signal(true); busy = signal(false); error = signal('');
  boxes = computed(() => this.rows().reduce((a, o) => a + o.qty, 0));
  riders = computed(() => Math.ceil(this.rows().length / MAX_ORDERS));

  constructor() {
    this.load();
    this.api.customers().subscribe({
      next: c => { this.customers.set(c); if (!this.cid() && c.length) this.cid.set(c[0].customer_id); },
      error: () => this.error.set('โหลดรายชื่อลูกค้าไม่ได้ จึงเพิ่มออเดอร์ใหม่ไม่ได้'),
    });
  }

  load() {
    this.api.orders().subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('โหลดออเดอร์ไม่ได้ ตรวจว่า API บน Render ยังทำงานอยู่ แล้วรีเฟรชหน้านี้'); },
    });
  }

  private run(obs: Observable<unknown>, msg: string) {
    this.busy.set(true); this.error.set('');
    obs.subscribe({ next: () => { this.busy.set(false); this.load(); }, error: () => { this.busy.set(false); this.error.set(msg); this.load(); } });
  }

  add() { this.run(this.api.addOrder(this.cid(), this.qty()), 'เพิ่มออเดอร์ไม่ได้ ลองอีกครั้ง'); }
  setQty(o: OrderRow, q: number) { this.run(this.api.editOrder(o.id, q), 'แก้ไขจำนวนกล่องไม่ได้ ลองอีกครั้ง'); }
  remove(o: OrderRow) { this.run(this.api.delOrder(o.id), 'ลบออเดอร์ไม่ได้ ลองอีกครั้ง'); }
  seed() { this.run(this.api.reseedOrders(), 'สุ่มออเดอร์จำลองไม่ได้ ลองอีกครั้ง'); }
  clear() { if (confirm('ลบออเดอร์ทั้งหมด ?')) this.run(this.api.clearOrders(), 'ล้างออเดอร์ไม่ได้ ลองอีกครั้ง'); }
}
