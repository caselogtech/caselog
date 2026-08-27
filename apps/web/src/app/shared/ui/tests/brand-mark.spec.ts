import { TestBed } from '@angular/core/testing';
import { BrandMark } from '../brand-mark/brand-mark';

describe('BrandMark', () => {
  it('renders the decorative Framed Log geometry', async () => {
    await TestBed.configureTestingModule({ imports: [BrandMark] }).compileComponents();
    const fixture = TestBed.createComponent(BrandMark);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelectorAll('rect')).toHaveLength(2);
  });
});
