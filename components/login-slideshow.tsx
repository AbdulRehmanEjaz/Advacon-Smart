'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// Add or replace photographs here; files live in public/images/login.
const slides = [
  { src: '/images/login/big-deer.jpg', alt: 'Arabian oryx in a desert habitat' },
  { src: '/images/login/deer-cover.jpg', alt: 'Gazelle beneath desert trees' },
  { src: '/images/login/canyon-tree.jpg', alt: 'A tree growing between desert canyon walls' },
  { src: '/images/login/desert-landscape.jpg', alt: 'Sand dunes and sandstone cliffs in the project landscape' },
  { src: '/images/login/harry.jpg', alt: 'Planting a young tree in the desert' },
];

export function LoginSlideshow() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 3000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="login-slideshow" aria-label="Project photographs" aria-roledescription="carousel">
      {slides.map((slide, index) => (
        <Image key={slide.src} src={slide.src} alt={slide.alt} fill unoptimized sizes="(max-width: 760px) 100vw, 68vw" className={index === active ? 'active' : ''}
          aria-hidden={index !== active} decoding="async" loading={index === 0 ? 'eager' : 'lazy'} />
      ))}
      <div className="login-slide-controls">
        <div className="login-slide-dots">
          {slides.map((slide, index) => (
            <button key={slide.src} type="button" aria-label={`Show photograph ${index + 1}: ${slide.alt}`}
              aria-pressed={index === active} onClick={() => setActive(index)}><span /></button>
          ))}
        </div>
      </div>
    </section>
  );
}
