/* ============================================================
   INHYMA Solutions LLP — Main JavaScript
   Premium Industrial Website Interactions
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all modules
  initStickyHeader();
  initMobileMenu();
  initScrollReveal();
  initCounterAnimation();
  initTimelineAnimation();
  initSmoothScroll();
  initFormValidation();
  initActiveNavHighlight();
});

/* ============================================================
   1. STICKY HEADER
   ============================================================ */
function initStickyHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  let lastScroll = 0;
  const scrollThreshold = 50;

  function handleScroll() {
    const currentScroll = window.pageYOffset;

    if (currentScroll > scrollThreshold) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check
}

/* ============================================================
   2. MOBILE MENU
   ============================================================ */
function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('header');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    nav.classList.toggle('open');
    if (header) {
      header.classList.toggle('menu-open');
    }
    document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
  });

  // Close menu when clicking a link
  nav.querySelectorAll('.header__nav-link').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('open');
      nav.classList.remove('open');
      if (header) {
        header.classList.remove('menu-open');
      }
      document.body.style.overflow = '';
    });
  });

  // Close menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      toggle.classList.remove('open');
      nav.classList.remove('open');
      if (header) {
        header.classList.remove('menu-open');
      }
      document.body.style.overflow = '';
    }
  });
}

/* ============================================================
   3. SCROLL REVEAL ANIMATIONS
   ============================================================ */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Once revealed, stop observing for performance
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  reveals.forEach(el => observer.observe(el));
}

/* ============================================================
   4. ANIMATED COUNTERS
   ============================================================ */
function initCounterAnimation() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.5
  });

  counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element) {
  const target = parseInt(element.dataset.count, 10);
  const duration = 2000; // 2 seconds
  const startTime = performance.now();
  const startValue = 0;

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuart(progress);
    const current = Math.floor(startValue + (target - startValue) * easedProgress);

    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

/* ============================================================
   5. TIMELINE ANIMATION
   ============================================================ */
function initTimelineAnimation() {
  const timeline = document.getElementById('workTimeline');
  if (!timeline) return;

  const steps = timeline.querySelectorAll('.timeline__step');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        timeline.classList.add('animated');

        // Animate each step with delay
        steps.forEach((step, index) => {
          setTimeout(() => {
            step.classList.add('active');
          }, 200 * (index + 1));
        });

        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.3
  });

  observer.observe(timeline);
}

/* ============================================================
   6. SMOOTH SCROLLING
   ============================================================ */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      const headerOffset = 100;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    });
  });
}

/* ============================================================
   7. FORM VALIDATION
   ============================================================ */
function initFormValidation() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Simple validation
    const name = form.querySelector('#name');
    const mobile = form.querySelector('#mobile');
    const email = form.querySelector('#email');

    let isValid = true;

    // Clear previous errors
    form.querySelectorAll('.form-input, .form-textarea, .form-select').forEach(input => {
      input.style.borderColor = '';
    });

    if (!name.value.trim()) {
      name.style.borderColor = 'var(--color-error)';
      isValid = false;
    }

    if (!mobile.value.trim()) {
      mobile.style.borderColor = 'var(--color-error)';
      isValid = false;
    }

    if (!email.value.trim() || !isValidEmail(email.value)) {
      email.style.borderColor = 'var(--color-error)';
      isValid = false;
    }

    if (isValid) {
      // Show success feedback
      const submitBtn = form.querySelector('#submit-inquiry');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Thank You! We'll Contact You Soon.
      `;
      submitBtn.style.background = 'var(--color-success)';
      submitBtn.style.boxShadow = '0 4px 14px rgba(30, 169, 124, 0.35)';
      submitBtn.disabled = true;

      // Reset after 5 seconds
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.style.background = '';
        submitBtn.style.boxShadow = '';
        submitBtn.disabled = false;
        form.reset();
      }, 5000);
    }
  });

  // Real-time validation feedback
  form.querySelectorAll('.form-input, .form-textarea').forEach(input => {
    input.addEventListener('blur', function () {
      if (this.hasAttribute('required') && !this.value.trim()) {
        this.style.borderColor = 'var(--color-error)';
      } else {
        this.style.borderColor = '';
      }
    });

    input.addEventListener('input', function () {
      if (this.style.borderColor) {
        this.style.borderColor = '';
      }
    });
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============================================================
   8. ACTIVE NAV HIGHLIGHTING
   ============================================================ */
function initActiveNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.header__nav-link');

  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');

        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, {
    threshold: 0.2,
    rootMargin: '-80px 0px -50% 0px'
  });

  sections.forEach(section => observer.observe(section));
}

/* ============================================================
   9. PARALLAX EFFECT ON HERO (subtle)
   ============================================================ */
window.addEventListener('scroll', () => {
  const hero = document.querySelector('.hero__bg img');
  if (!hero) return;

  const scrolled = window.pageYOffset;
  if (scrolled < window.innerHeight) {
    hero.style.transform = `translateY(${scrolled * 0.3}px) scale(1.1)`;
  }
}, { passive: true });

/* ============================================================
   10. CATEGORY CARD HOVER TILT EFFECT
   ============================================================ */
document.querySelectorAll('.category-card, .industry-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});
