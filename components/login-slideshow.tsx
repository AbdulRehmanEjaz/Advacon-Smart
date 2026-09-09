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
  const [{ active, previous }, setSlide] = useState<{ active: number; previous: number | null }>({ active: 0, previous: null });
  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => ({ active: (current.active + 1) % slides.length, previous: current.active })), 3000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="login-slideshow" aria-label="Project photographs" aria-roledescription="carousel">
      {slides.map((slide, index) => (
        <Image key={slide.src} src={slide.src} alt={slide.alt} fill unoptimized sizes="(max-width: 760px) 100vw, 68vw" className={index === active ? `active ${previous !== null ? 'slide-enter' : ''}` : index === previous ? 'slide-exit' : ''}
          aria-hidden={index !== active} decoding="async" loading={index === 0 ? 'eager' : 'lazy'} />
      ))}
      <div className="login-slide-controls">
        <div className="login-slide-dots">
          {slides.map((slide, index) => (
            <button key={slide.src} type="button" aria-label={`Show photograph ${index + 1}: ${slide.alt}`}
              aria-pressed={index === active} onClick={() => setSlide((current) => index === current.active ? current : { active: index, previous: current.active })}><span /></button>
          ))}
        </div>
      </div>
    </section>
  );
}
