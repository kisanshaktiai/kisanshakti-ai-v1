import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink } from 'lucide-react';

export default function Schemes() {
  const { t } = useTranslation();

  const schemes = [
    {
      title: 'PM-KISAN',
      description: 'Direct income support of ₹6000 per year',
      eligibility: 'Small and marginal farmers',
      amount: '₹6000/year',
    },
    {
      title: 'Crop Insurance',
      description: 'Insurance coverage for crop loss',
      eligibility: 'All farmers',
      amount: 'Variable',
    },
    {
      title: 'Soil Health Card',
      description: 'Free soil testing and recommendations',
      eligibility: 'All farmers',
      amount: 'Free',
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.schemes')}</h1>
      
      <div className="space-y-4">
        {schemes.map((scheme, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {scheme.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{scheme.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Eligibility:</span>
                  <span className="font-medium">{scheme.eligibility}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium text-success">{scheme.amount}</span>
                </div>
              </div>
              <Button className="w-full" size="sm">
                Apply Now
                <ExternalLink className="w-3 h-3 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}