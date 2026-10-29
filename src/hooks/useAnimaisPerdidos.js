import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../components/PerdidoForm';

export default function useAnimaisPerdidos() {
  const [perdidos, setPerdidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api('/perdidos').then(data => { if (active) setPerdidos(data.perdidos); })
      .catch(err => { if (active) setError(friendlyError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  // Atualiza ao voltar para a aba; não perde a lista se uma atualização falhar.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);
  return { perdidos, loading, error, reload };
}
