import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Database, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { localDB } from '@/services/localDB';
import { syncService } from '@/services/syncService';

export function OfflineModeDebugger() {
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [localData, setLocalData] = useState<{
    lands: number;
    schedules: number;
    lastSync: string | null;
  }>({
    lands: 0,
    schedules: 0,
    lastSync: null,
  });
  const [testResults, setTestResults] = useState<{
    dataIsolation: 'pass' | 'fail' | 'pending';
    message: string;
  }>({
    dataIsolation: 'pending',
    message: 'Click "Test Data Isolation" to verify',
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadLocalData();
    }
  }, [user?.id]);

  const loadLocalData = async () => {
    if (!user?.id) return;

    try {
      const lands = await localDB.getLands(undefined, user.id);
      const schedules = await localDB.getAllSchedules(user.id);
      const metadata = await localDB.getSyncMetadata();

      setLocalData({
        lands: lands.length,
        schedules: schedules.length,
        lastSync: metadata?.lastSyncTime 
          ? new Date(metadata.lastSyncTime).toLocaleString() 
          : null,
      });
    } catch (error) {
      console.error('Error loading local data:', error);
    }
  };

  const testDataIsolation = async () => {
    if (!user?.id) {
      setTestResults({
        dataIsolation: 'fail',
        message: 'No user logged in',
      });
      return;
    }

    try {
      // Test 1: Check if getLands without farmerId returns empty (security check)
      const allLands = await localDB.getLands();
      
      // Test 2: Check if getLands WITH farmerId returns only farmer's data
      const farmerLands = await localDB.getLands(undefined, user.id);
      
      // Test 3: Check schedules
      const farmerSchedules = await localDB.getAllSchedules(user.id);

      // Verify each land belongs to the current farmer
      const invalidLands = farmerLands.filter(land => land.farmer_id !== user.id);
      
      // Verify each schedule belongs to the current farmer
      const invalidSchedules = farmerSchedules.filter(schedule => schedule.farmer_id !== user.id);

      if (allLands.length === 0 && invalidLands.length === 0 && invalidSchedules.length === 0) {
        setTestResults({
          dataIsolation: 'pass',
          message: `✅ Data isolation verified! Found ${farmerLands.length} lands and ${farmerSchedules.length} schedules for farmer ${user.id.slice(0, 8)}... All data belongs to current farmer. Security check passed (no data without farmerId filter).`,
        });
      } else {
        setTestResults({
          dataIsolation: 'fail',
          message: `❌ Data isolation FAILED! Found ${invalidLands.length} lands and ${invalidSchedules.length} schedules that don't belong to farmer ${user.id.slice(0, 8)}... Security issue detected!`,
        });
      }
    } catch (error) {
      setTestResults({
        dataIsolation: 'fail',
        message: `Error during test: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  const forceSync = async () => {
    await syncService.performSync(true);
    await loadLocalData();
  };

  const simulateOffline = () => {
    if (isOnline) {
      window.dispatchEvent(new Event('offline'));
      console.log('🧪 [Debug] Simulated offline mode');
    } else {
      window.dispatchEvent(new Event('online'));
      console.log('🧪 [Debug] Simulated online mode');
    }
  };

  if (!user) return null;

  return (
    <Card className="fixed bottom-20 right-4 w-96 z-50 shadow-lg border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>🧪 Offline Mode Debugger</span>
          <Badge variant={isOnline ? 'default' : 'secondary'}>
            {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {/* Current User Info */}
        <div className="space-y-1">
          <div className="font-semibold">Current Farmer:</div>
          <div className="text-muted-foreground font-mono">
            {user.id.slice(0, 20)}...
          </div>
          <div className="text-muted-foreground">
            Tenant: {user.tenantId?.slice(0, 20)}...
          </div>
        </div>

        {/* Local Database Stats */}
        <div className="space-y-1 border-t pt-3">
          <div className="font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            Local Database (IndexedDB)
          </div>
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            <div>Lands: {localData.lands}</div>
            <div>Schedules: {localData.schedules}</div>
          </div>
          {localData.lastSync && (
            <div className="text-muted-foreground">
              Last Sync: {localData.lastSync}
            </div>
          )}
        </div>

        {/* Data Isolation Test Results */}
        <div className="space-y-2 border-t pt-3">
          <div className="font-semibold">Data Isolation Test:</div>
          <div className={`p-2 rounded text-xs ${
            testResults.dataIsolation === 'pass' 
              ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
              : testResults.dataIsolation === 'fail'
              ? 'bg-red-500/10 text-red-700 dark:text-red-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            {testResults.dataIsolation === 'pass' && <CheckCircle className="h-4 w-4 inline mr-1" />}
            {testResults.dataIsolation === 'fail' && <XCircle className="h-4 w-4 inline mr-1" />}
            {testResults.message}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t pt-3">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={testDataIsolation}
            className="w-full"
          >
            Test Data Isolation
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={simulateOffline}
            className="w-full"
          >
            {isOnline ? 'Simulate Offline' : 'Simulate Online'}
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={forceSync}
            className="w-full"
          >
            <RefreshCw className="h-3 w-3 mr-2" />
            Force Sync Now
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-muted-foreground text-xs border-t pt-3">
          <strong>Test Steps:</strong>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>Click "Force Sync Now" to sync data</li>
            <li>Click "Simulate Offline" to go offline</li>
            <li>Click "Test Data Isolation" to verify</li>
            <li>Check that only YOUR data is visible</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
