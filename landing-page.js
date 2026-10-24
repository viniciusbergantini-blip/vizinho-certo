(function () {
  function roundedProof(value) {
    const count = Number(value || 0);
    return count >= 10 ? Math.floor(count / 10) * 10 : 0;
  }

  async function loadProof() {
    const city = String(document.documentElement.dataset.city || 'geral');
    const cityName = String(document.documentElement.dataset.cityName || '');
    const target = document.getElementById('local-proof');
    if (!target) return;

    try {
      const response = await fetch(`/api/public-stats?city=${encodeURIComponent(city)}`);
      const data = await response.json();
      if (!response.ok) return;
      const local = roundedProof(data.registered_city);
      const total = roundedProof(data.registered_total);
      if (local && cityName) target.textContent = `${local}+ moradores de ${cityName} já se cadastraram`;
      else if (total) target.textContent = `${total}+ moradores já se cadastraram no Vizinho Certo`;
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', loadProof);
})();
