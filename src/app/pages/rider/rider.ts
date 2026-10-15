import { Component, computed, inject, signal } from '@angular/core';
import { firstName, val } from '../../core/api';
import { ok } from '../../core/map';
import { Job, Store } from '../../core/store';

const norm = (s: string) => { const m = s.trim().toUpperCase().match(/^(?:JOB)?[-\s]?(\d+)$/); return m ? `JOB-${m[1].padStart(2, '0')}` : s.trim().toUpperCase(); };

@Component({
  selector: 'app-rider',
  standalone: true,
  template: `
    <div class="phone">
      <h2>📱 ใบงานไรเดอร์</h2>
      <input class="code" placeholder="กรอกเลขใบงาน เช่น JOB-01" [value]="code()" (input)="code.set(v($event))">
      <div class="chips">
        @for (j of store.jobs(); track j.code) { <button class="chip" [class.on]="j.code === key()" (click)="code.set(j.code)">{{ j.code }}</button> }
      </div>
      @if (job(); as j) {
        <div class="kpis two">
          <div class="kpi"><span>หยิบข้าวกล่อง</span><b>{{ j.boxes }} กล่อง</b></div>
          <div class="kpi"><span>จำนวนจุดส่ง</span><b>{{ j.stops.length }} จุด</b></div>
        </div>
        <ol class="stops">
          @for (s of j.stops; track $index) {
            <li>
              <a class="num" [href]="stopUrl(s)" target="_blank" rel="noopener" [attr.aria-label]="'เปิดแผนที่นำทางไปจุดที่ ' + ($index + 1)">{{ $index + 1 }}</a>
              <div>
                <b>จุดที่ {{ $index + 1 }}: บ้านคุณ {{ first(s.name) }}</b>
                <p>{{ s.qty }} กล่อง · โทร {{ s.phone || '-' }}</p>
                <p>ถึงโดยประมาณ {{ s.eta }} น.</p>
              </div>
            </li>
          }
        </ol>
        <a class="btn block" [href]="url(j)" target="_blank" rel="noopener">🧭 เปิดแผนที่นำทาง</a>
      } @else if (!store.jobs().length) {
        <p class="muted">ยังไม่มีใบงาน ให้เจ้าของร้านไปหน้า "จัดเส้นทาง" ก่อน</p>
      } @else {
        <p class="muted">ไม่พบใบงานเลขนี้ ลองเลือกจากปุ่มด้านบน</p>
      }
    </div>`,
})
export class Rider {
  store = inject(Store);
  v = val; first = firstName;
  code = signal(this.store.jobs()[0]?.code ?? '');
  key = computed(() => norm(this.code()));
  job = computed(() => this.store.jobs().find(j => j.code === this.key()) ?? null);

  /** กดเลขจุด -> เปิด Google Maps นำทางจากตำแหน่งปัจจุบันของไรเดอร์ไปบ้านลูกค้าจุดนั้น */
  stopUrl(s: Job['stops'][number]) {
    return ok(s.lat, s.lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=two-wheeler`
      : null;
  }

  url(j: Job) {
    const s = this.store.shop(), pt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`, last = j.stops[j.stops.length - 1];
    const via = j.stops.slice(0, -1).map(pt).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${pt(s)}&destination=${pt(last)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}&travelmode=two-wheeler`;
  }
}