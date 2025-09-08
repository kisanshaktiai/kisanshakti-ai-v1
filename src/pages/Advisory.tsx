import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function Advisory() {
  const { t } = useTranslation();

  const advisories = [
    {
      title: 'Irrigation Advisory',
      content: 'Light irrigation recommended for wheat crop in next 2 days',
      type: 'info',
      date: '2 hours ago',
    },
    {
      title: 'Pest Alert',
      content: 'Aphid attack reported in nearby areas. Apply preventive measures',
      type: 'warning',
      date: '5 hours ago',
    },
    {
      title: 'Market Update',
      content: 'Good time to sell wheat. Prices expected to drop next week',
      type: 'success',
      date: '1 day ago',
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.advisory')}</h1>
      
      <div className="space-y-4">
        {advisories.map((advisory, index) => (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {advisory.type === 'warning' ? (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-success" />
                  )}
                  {advisory.title}
                </CardTitle>
                <span className="text-xs text-muted-foreground">{advisory.date}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{advisory.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}