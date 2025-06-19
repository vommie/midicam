export function isElementVisible(el) {
    if (!el || el.offsetParent === null) {
        return false;
    }

    const parentSection = el.closest('.sidebar-section');
    if (parentSection && parentSection.classList.contains('collapsed')) {
        return false;
    }

    const rect = el.getBoundingClientRect();
    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
}
