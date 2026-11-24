import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RoleOptionList } from '@/components/identity/RoleOptionList';
import { isMultiRoleEnabled } from '@/services/farmerAuthService';
import { REGISTER_ROLES_KEY } from '@/services/accountSessionService';
import { isFarmerOnly, normaliseRoles, type AccountRole } from '@/lib/accountRoles';

/**
 * Registration step "How will you use the app?" — shown between the mobile
 * number and the PIN, only while the multi-role flag is on for the tenant.
 *
 * Farmer alone → nothing is stored and /set-pin runs today's farmer
 * registration unchanged. Any other choice is handed to /set-pin, which sends
 * it with the same register call.
 */
export default function ChooseRoles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<AccountRole[]>(() => {
    try { return normaliseRoles(JSON.parse(localStorage.getItem(REGISTER_ROLES_KEY) || '[]')); } catch { return []; }
  });

  const mobile = localStorage.getItem('registerMobile');
  const tenantId = localStorage.getItem('tenantId');
  const isNewRegistration = localStorage.getItem('isNewRegistration') === 'true';

  useEffect(() => {
    if (!mobile || !tenantId || !isNewRegistration) {
      navigate('/auth', { replace: true });
    } else if (!isMultiRoleEnabled()) {
      navigate('/set-pin', { replace: true });
    }
  }, [mobile, tenantId, isNewRegistration, navigate]);

  const toggle = (role: AccountRole) =>
    setSelected((prev) => normaliseRoles(prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const handleContinue = () => {
    if (selected.length === 0) return;
    if (isFarmerOnly(selected)) localStorage.removeItem(REGISTER_ROLES_KEY);
    else localStorage.setItem(REGISTER_ROLES_KEY, JSON.stringify(selected));
    navigate('/set-pin');
  };

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('auth.back')}
          </Button>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{t('identity.chooseRoles.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('identity.chooseRoles.description')}</p>
          </div>
        </div>

        <RoleOptionList selected={selected} onToggle={toggle} />

        <div className="space-y-2">
          <Button onClick={handleContinue} disabled={selected.length === 0} className="w-full h-12 text-base">
            {t('auth.continue')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('identity.chooseRoles.addLater')}</p>
        </div>
      </Card>
    </div>
  );
}
