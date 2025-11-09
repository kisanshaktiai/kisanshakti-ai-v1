import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ScheduleRow {
  id: string;
  stage: string;
  timing: string;
  material: string;
  quantity: string;
  completed?: boolean;
}

interface InteractiveScheduleTableProps {
  title: string;
  rows: ScheduleRow[];
  onSave?: (updatedRows: ScheduleRow[]) => void;
  className?: string;
}

export function InteractiveScheduleTable({ 
  title, 
  rows: initialRows, 
  onSave,
  className 
}: InteractiveScheduleTableProps) {
  const [rows, setRows] = useState<ScheduleRow[]>(initialRows);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedQuantity, setEditedQuantity] = useState('');

  const handleToggleComplete = (id: string) => {
    const updated = rows.map(row =>
      row.id === id ? { ...row, completed: !row.completed } : row
    );
    setRows(updated);
  };

  const handleStartEdit = (row: ScheduleRow) => {
    setEditingRow(row.id);
    setEditedQuantity(row.quantity);
  };

  const handleSaveEdit = (id: string) => {
    const updated = rows.map(row =>
      row.id === id ? { ...row, quantity: editedQuantity } : row
    );
    setRows(updated);
    setEditingRow(null);
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditedQuantity('');
  };

  const handleSaveAll = () => {
    onSave?.(rows);
  };

  const completedCount = rows.filter(r => r.completed).length;
  const progress = (completedCount / rows.length) * 100;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with Progress */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-foreground">{title}</h4>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedCount}/{rows.length}
            </span>
          </div>
        </div>
        {onSave && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveAll}
            className="ml-4"
          >
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[50px]">Done</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="w-[150px]">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {rows.map((row, index) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "border-b transition-colors",
                    row.completed && "bg-muted/30"
                  )}
                >
                  <TableCell className="text-center">
                    <Checkbox
                      checked={row.completed || false}
                      onCheckedChange={() => handleToggleComplete(row.id)}
                      className="mx-auto"
                    />
                  </TableCell>
                  <TableCell className={cn(
                    "font-medium text-sm",
                    row.completed && "text-muted-foreground line-through"
                  )}>
                    {row.stage}
                  </TableCell>
                  <TableCell className={cn(
                    "text-sm",
                    row.completed && "text-muted-foreground line-through"
                  )}>
                    {row.timing}
                  </TableCell>
                  <TableCell className={cn(
                    "text-sm",
                    row.completed && "text-muted-foreground line-through"
                  )}>
                    {row.material}
                  </TableCell>
                  <TableCell>
                    {editingRow === row.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editedQuantity}
                          onChange={(e) => setEditedQuantity(e.target.value)}
                          className="h-7 text-xs"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleSaveEdit(row.id)}
                        >
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={handleCancelEdit}
                        >
                          <XCircle className="w-3 h-3 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-sm",
                          row.completed && "text-muted-foreground line-through"
                        )}>
                          {row.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleStartEdit(row)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
