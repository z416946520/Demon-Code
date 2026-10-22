(() => {
  const nav = document.querySelector('.nav');
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav-links');

  const onScroll = () => {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Copy buttons keep the original label and restore it after a short confirmation.
  document.querySelectorAll('.copy-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const text = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
        const previous = button.textContent;
        button.textContent = '已复制';
        button.disabled = true;
        setTimeout(() => {
          button.textContent = previous;
          button.disabled = false;
        }, 1200);
      } catch {
        button.textContent = '复制失败';
        setTimeout(() => { button.textContent = '复制'; }, 1200);
      }
    });
  });

  // Only one FAQ answer stays open, so the section does not turn into a wall.
  const faqs = [...document.querySelectorAll('.faq-wrap details')];
  faqs.forEach(item => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      faqs.forEach(other => { if (other !== item) other.open = false; });
    });
  });
})();
