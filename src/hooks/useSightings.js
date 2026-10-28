import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function useSightings() {
  const [sightings, setSightings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api('/avistamentos').then(data => { if (active) setSightings(data.avistamentos); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  // Atualiza ao voltar para a aba; não perde a lista se uma atualização falhar.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);
  return { sightings, loading, error, reload };
}
