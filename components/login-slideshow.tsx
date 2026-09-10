'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// Add or replace photographs here; files live in public/images/login.
const slides = [
  { src: '/images/login/big-deer.jpg', alt: 'Arabian oryx in a desert habitat' },
  { src: '/images/login/deer-cover.jpg', alt: 'Gazelle beneath desert trees' },
  { src: '/images/login/project-1.png', alt: 'Young tree with drip irrigation at sunset' },
  { src: '/images/login/project-2.png', alt: 'Palm oasis beneath sandstone peaks' },
  { src: '/images/login/project-3.png', alt: 'Rows of nursery trees against desert mountains' },
  { src: '/images/login/project-4.png', alt: 'Sunlight shining through green leaves' },
  { src: '/images/login/project-5.png', alt: 'Sunset over a desert oasis' },
  { src: '/images/login/project-6.png', alt: 'Drip irrigation watering a tree' },
  { src: '/images/login/project-7.png', alt: 'Shaded nursery with rows of young plants' },
  { src: '/images/login/project-8.png', alt: 'Gloved hands planting a young tree' },
  { src: '/images/login/project-9.png', alt: 'Green palm grove surrounded by desert mountains' },
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
