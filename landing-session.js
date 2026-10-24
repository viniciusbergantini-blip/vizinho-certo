(function () {
  async function redirectKnownUser() {
    const appUrl = '/app';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) {
      window.location.replace(appUrl);
      return;
    }
    if (!window.supabase) return;
    try {
      const client = window.supabase.createClient(
        'https://xurtdibicsxmouvzfxvb.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cnRkaWJpY3N4bW91dnpmeHZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTUzNjcsImV4cCI6MjA4OTg3MTM2N30.WQ36EsY2JHP5G4VvLAfRNv7j4RjArne1sjbRS_tfvUU'
      );
      const { data: { session } } = await client.auth.getSession();
      if (session) window.location.replace(appUrl);
    } catch (_) {}
  }
  redirectKnownUser();
})();
