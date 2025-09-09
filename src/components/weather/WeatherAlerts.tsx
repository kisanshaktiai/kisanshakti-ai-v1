import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertTriangle, Info, CheckCircle, Plus, Trash2, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WeatherAlert {
  id: string;
  alert_type: string;
  threshold_value: number;
  comparison_operator: string;
  is_active: boolean;
}

export const WeatherAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({
    alert_type: 'temperature',
    threshold_value: 0,
    comparison_operator: 'greater_than',
    is_active: true,
  });
  const { toast } = useToast();

  const alertTypes = [
    { value: 'temperature', label: 'Temperature', unit: '°C' },
    { value: 'rainfall', label: 'Rainfall', unit: 'mm' },
    { value: 'wind_speed', label: 'Wind Speed', unit: 'km/h' },
    { value: 'humidity', label: 'Humidity', unit: '%' },
    { value: 'uv_index', label: 'UV Index', unit: '' },
  ];

  const operators = [
    { value: 'greater_than', label: 'Greater than' },
    { value: 'less_than', label: 'Less than' },
    { value: 'equal_to', label: 'Equal to' },
  ];

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('weather_alerts')
      .select('*')
      .eq('event_type', 'custom_threshold')
      .order('created_at', { ascending: false });

    if (data) {
      setAlerts(data as any);
    }
  };

  const addAlert = async () => {
    const { error } = await supabase.from('weather_alerts').insert({
      alert_id: `alert-${Date.now()}`,
      area_name: 'User Location',
      event_type: 'custom_threshold',
      severity: 'moderate',
      urgency: 'expected',
      certainty: 'likely',
      title: `${newAlert.alert_type} Alert`,
      description: `Alert when ${newAlert.alert_type} ${newAlert.comparison_operator} ${newAlert.threshold_value}`,
      data_source: 'user_defined',
      start_time: new Date().toISOString(),
      alert_type: newAlert.alert_type,
      threshold_value: newAlert.threshold_value,
      comparison_operator: newAlert.comparison_operator,
      is_active: newAlert.is_active,
    });

    if (!error) {
      toast({
        title: "Alert created",
        description: "Your weather alert has been set up successfully.",
      });
      setShowAddAlert(false);
      fetchAlerts();
    }
  };

  const toggleAlert = async (id: string, isActive: boolean) => {
    await supabase
      .from('weather_alerts')
      .update({ is_active: isActive })
      .eq('id', id);
    
    fetchAlerts();
  };

  const deleteAlert = async (id: string) => {
    await supabase
      .from('weather_alerts')
      .delete()
      .eq('id', id);
    
    toast({
      title: "Alert deleted",
      description: "The weather alert has been removed.",
    });
    fetchAlerts();
  };

  // Sample active weather warnings
  const activeWarnings = [
    {
      severity: 'high',
      type: 'Heavy Rainfall',
      message: 'Heavy rainfall expected in the next 24 hours. Take precautions for your crops.',
      icon: AlertTriangle,
    },
    {
      severity: 'medium',
      type: 'High Temperature',
      message: 'Temperature above 40°C expected. Ensure adequate irrigation.',
      icon: Info,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Active Warnings */}
      <div className="space-y-4">
        {activeWarnings.map((warning, index) => (
          <Alert
            key={index}
            variant={warning.severity === 'high' ? 'destructive' : 'default'}
            className="border-2"
          >
            <warning.icon className="h-4 w-4" />
            <AlertTitle>{warning.type}</AlertTitle>
            <AlertDescription>{warning.message}</AlertDescription>
          </Alert>
        ))}
      </div>

      {/* Custom Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Custom Weather Alerts
            </CardTitle>
            <Button onClick={() => setShowAddAlert(!showAddAlert)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Alert
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddAlert && (
            <div className="mb-6 p-4 border rounded-lg bg-secondary/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Alert Type</Label>
                  <Select
                    value={newAlert.alert_type}
                    onValueChange={(value) => setNewAlert({ ...newAlert, alert_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {alertTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Condition</Label>
                  <Select
                    value={newAlert.comparison_operator}
                    onValueChange={(value) => setNewAlert({ ...newAlert, comparison_operator: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Threshold Value</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={newAlert.threshold_value}
                      onChange={(e) => setNewAlert({ ...newAlert, threshold_value: parseFloat(e.target.value) })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {alertTypes.find(t => t.value === newAlert.alert_type)?.unit}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={newAlert.is_active}
                    onCheckedChange={(checked) => setNewAlert({ ...newAlert, is_active: checked })}
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <Button onClick={addAlert} size="sm">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save Alert
                </Button>
                <Button onClick={() => setShowAddAlert(false)} variant="outline" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Switch
                    checked={alert.is_active}
                    onCheckedChange={(checked) => toggleAlert(alert.id, checked)}
                  />
                  <div>
                    <p className="font-semibold">
                      {alertTypes.find(t => t.value === alert.alert_type)?.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {operators.find(o => o.value === alert.comparison_operator)?.label} {alert.threshold_value}
                      {alertTypes.find(t => t.value === alert.alert_type)?.unit}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant={alert.is_active ? 'default' : 'secondary'}>
                    {alert.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    onClick={() => deleteAlert(alert.id)}
                    variant="ghost"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            
            {alerts.length === 0 && !showAddAlert && (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No custom alerts set</p>
                <p className="text-sm mt-2">Create alerts to get notified about specific weather conditions</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Receive alerts on your device</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">SMS Alerts</p>
                <p className="text-sm text-muted-foreground">Get critical alerts via SMS</p>
              </div>
              <Switch />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive daily weather summaries</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};