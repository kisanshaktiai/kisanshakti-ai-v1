import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';

interface UpgradePromptProps {
  feature?: string;
  title?: string;
  description?: string;
}

/**
 * Friendly upgrade prompt shown when a feature is gated by SubscriptionGate.
 * Used as fallback inside <SubscriptionGate fallback={<UpgradePrompt />}>.
 */
export function UpgradePrompt({
  feature,
  title = 'Premium Feature',
  description = 'Upgrade your plan to unlock this feature and grow your farm smarter.',
}: UpgradePromptProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-sm w-full border bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 shadow-xl">
        <CardContent className="p-6 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <Lock className="w-7 h-7 text-primary-foreground" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5 justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">{description}</p>
            {feature && (
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide pt-1">
                Required feature: <span className="font-mono">{feature}</span>
              </p>
            )}
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => navigate('/app/subscription')}
          >
            View Plans
            <ArrowRight className="w-4 h-4" />
          </Button>

          <p className="text-[10px] text-muted-foreground">
            Plans starting at ₹99/month
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
