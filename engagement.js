(function initEngagement(root, factory) {
  const engagement = factory();
  if (typeof module === 'object' && module.exports) module.exports = engagement;
  else root.VizinhoCertoEngagement = engagement;
})(typeof window !== 'undefined' ? window : globalThis, function createEngagement() {
  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isPlaceholderPost(post) {
    return String(post?.id || '').startsWith('bv');
  }

  function summarizeNeighborhood({ posts = [], eventCount = 0, lastVisit = null } = {}) {
    const realPosts = posts.filter(post => !post?.isAnuncio && !isPlaceholderPost(post));
    const services = posts.filter(post => post?.isAnuncio);
    const lastVisitDate = lastVisit ? new Date(lastVisit) : null;
    const hasValidLastVisit = lastVisitDate && !Number.isNaN(lastVisitDate.getTime());
    const newItems = hasValidLastVisit
      ? posts.filter(post => {
        if (isPlaceholderPost(post) || !post?.criado_em) return false;
        const createdAt = new Date(post.criado_em);
        return !Number.isNaN(createdAt.getTime()) && createdAt > lastVisitDate;
      }).length
      : 0;

    return {
      posts: realPosts.length,
      services: services.length,
      events: Math.max(0, Number(eventCount) || 0),
      newItems,
      total: realPosts.length + services.length + Math.max(0, Number(eventCount) || 0),
    };
  }

  function filterServices(items = [], { category = 'todos', query = '' } = {}) {
    const normalizedQuery = normalizeText(query);
    return items.filter(item => {
      if (item?.pode_gerenciar) return false;
      if (category !== 'todos' && item?.tipo !== category) return false;
      if (!normalizedQuery) return true;
      return normalizeText([item?.nome, item?.tipo, item?.descricao].filter(Boolean).join(' '))
        .includes(normalizedQuery);
    });
  }

  function isReturningVisit(previousVisit, currentVisit = new Date(), minimumHours = 6) {
    if (!previousVisit) return false;
    const previous = new Date(previousVisit);
    const current = new Date(currentVisit);
    if (Number.isNaN(previous.getTime()) || Number.isNaN(current.getTime())) return false;
    return current.getTime() - previous.getTime() >= minimumHours * 60 * 60 * 1000;
  }

  function summarizeActivity({ posts = [], userId = null, ads = [], suggestions = [] } = {}) {
    return {
      posts: posts.filter(post => post?.usuario_id === userId && !post?.isAnuncio && !isPlaceholderPost(post)).length,
      ads: ads.length,
      suggestions: suggestions.length,
    };
  }

  return {
    filterServices,
    isPlaceholderPost,
    isReturningVisit,
    normalizeText,
    summarizeActivity,
    summarizeNeighborhood,
  };
});
