'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Employee, WorkTask } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'board' | 'tasks' | 'employees';
type TaskStatus = WorkTask['סטטוס'];
type TaskPriority = WorkTask['עדיפות'];

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TaskStatus, { label: string; bg: string; fg: string; border: string }> = {
  'ממתין':  { label: 'ממתין',  bg: '#EEF3FB', fg: '#1E4E8C', border: '#C5D9F2' },
  'בעבודה': { label: 'בעבודה', bg: '#FFF8E6', fg: '#7A5200', border: '#F0D870' },
  'הושלם':  { label: 'הושלם',  bg: '#EEF7EE', fg: '#1E5C31', border: '#A8D5B5' },
  'בוטל':   { label: 'בוטל',   bg: '#FFF0F0', fg: '#8B1C1C', border: '#F2AAAA' },
};

const ALL_STATUSES: TaskStatus[] = ['ממתין', 'בעבודה', 'הושלם', 'בוטל'];

const EMPTY_EMP_FORM = { שם_עובד: '', טלפון: '', אימייל: '', תפקיד: '' };
const EMPTY_TASK_FORM = {
  שם_משימה: '', פירוט: '', עובד_id: '', הזמנה_id: '',
  תאריך_יעד: '', שעת_יעד: '', עדיפות: 'רגיל' as TaskPriority, הערות: '',
  סטטוס: 'ממתין' as TaskStatus,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaskStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority !== 'דחוף') return null;
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: '#FFF0F0', color: '#8B1C1C', border: '1px solid #F2AAAA' }}
    >
      דחוף
    </span>
  );
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isOverdue(task: WorkTask) {
  if (!task.תאריך_יעד) return false;
  if (task.סטטוס === 'הושלם' || task.סטטוס === 'בוטל') return false;
  return task.תאריך_יעד < todayStr();
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>('board');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Board filter
  const [boardFilter, setBoardFilter] = useState<TaskStatus | 'all'>('all');

  // Tasks tab filter
  const [taskEmpFilter, setTaskEmpFilter]       = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | ''>('');

  // Employee modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editEmp, setEditEmp]           = useState<Employee | null>(null);
  const [empForm, setEmpForm]           = useState(EMPTY_EMP_FORM);
  const [savingEmp, setSavingEmp]       = useState(false);

  // Task modal
  const [showTaskModal, setShowTaskModal]   = useState(false);
  const [presetEmployee, setPresetEmployee] = useState<string>('');
  const [editTask, setEditTask]             = useState<WorkTask | null>(null);
  const [taskForm, setTaskForm]             = useState(EMPTY_TASK_FORM);
  const [savingTask, setSavingTask]         = useState(false);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [er, tr] = await Promise.all([fetch('/api/employees'), fetch('/api/tasks')]);
      const [ej, tj] = await Promise.all([er.json(), tr.json()]);
      setEmployees(ej.data || []);
      setTasks(tj.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Employee CRUD ──────────────────────────────────────────────────────────

  function openAddEmp() {
    setEditEmp(null);
    setEmpForm(EMPTY_EMP_FORM);
    setShowEmpModal(true);
  }

  function openEditEmp(emp: Employee) {
    setEditEmp(emp);
    setEmpForm({ שם_עובד: emp.שם_עובד, טלפון: emp.טלפון || '', אימייל: emp.אימייל || '', תפקיד: emp.תפקיד || '' });
    setShowEmpModal(true);
  }

  async function saveEmployee() {
    if (!empForm.שם_עובד.trim()) { toast.error('שם עובד הוא שדה חובה'); return; }
    setSavingEmp(true);
    try {
      const url    = editEmp ? `/api/employees/${editEmp.id}` : '/api/employees';
      const method = editEmp ? 'PATCH' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empForm) });
      const json   = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה'); return; }
      toast.success(editEmp ? 'עובד עודכן' : 'עובד נוסף');
      setShowEmpModal(false);
      loadAll();
    } finally {
      setSavingEmp(false);
    }
  }

  async function toggleEmpActive(emp: Employee) {
    const res  = await fetch(`/api/employees/${emp.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ פעיל: !emp.פעיל }) });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'שגיאה'); return; }
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, פעיל: !e.פעיל } : e));
  }

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  function openAddTask(employeeId = '') {
    setEditTask(null);
    setPresetEmployee(employeeId);
    setTaskForm({ ...EMPTY_TASK_FORM, עובד_id: employeeId });
    setShowTaskModal(true);
  }

  function openEditTask(task: WorkTask) {
    setEditTask(task);
    setPresetEmployee('');
    setTaskForm({
      שם_משימה:  task.שם_משימה,
      פירוט:     task.פירוט      || '',
      עובד_id:   task.עובד_id    || '',
      הזמנה_id:  task.הזמנה_id  || '',
      תאריך_יעד: task.תאריך_יעד || '',
      שעת_יעד:   task.שעת_יעד   || '',
      עדיפות:    task.עדיפות,
      הערות:     task.הערות      || '',
      סטטוס:     task.סטטוס,
    });
    setShowTaskModal(true);
  }

  async function saveTask() {
    if (!taskForm.שם_משימה.trim()) { toast.error('שם משימה הוא שדה חובה'); return; }
    setSavingTask(true);
    try {
      const url    = editTask ? `/api/tasks/${editTask.id}` : '/api/tasks';
      const method = editTask ? 'PATCH' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskForm) });
      const json   = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה'); return; }
      toast.success(editTask ? 'משימה עודכנה' : 'משימה נוספה');
      setShowTaskModal(false);
      loadAll();
    } finally {
      setSavingTask(false);
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    const res  = await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ סטטוס: status }) });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'שגיאה'); return; }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, סטטוס: status } : t));
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm('למחוק את המשימה?')) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('שגיאה במחיקה'); return; }
    setTasks(prev => prev.filter(t => t.id !== taskId));
    toast.success('המשימה נמחקה');
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const activeEmployees   = employees.filter(e => e.פעיל);
  const boardTasks        = boardFilter === 'all' ? tasks : tasks.filter(t => t.סטטוס === boardFilter);
  const unassigned        = boardTasks.filter(t => !t.עובד_id);
  const filteredTasksList = tasks.filter(t => {
    if (taskEmpFilter && t.עובד_id !== taskEmpFilter) return false;
    if (taskStatusFilter && t.סטטוס !== taskStatusFilter) return false;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-5" style={{ backgroundColor: '#F8F4EF', direction: 'rtl' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#2B1A10' }}>עובדים ומשימות</h1>
          <p className="text-[12px] mt-0.5" style={{ color: '#8A735F' }}>
            {activeEmployees.length} עובדים פעילים · {tasks.filter(t => t.סטטוס === 'ממתין' || t.סטטוס === 'בעבודה').length} משימות פתוחות
          </p>
        </div>
        <button
          onClick={() => openAddTask()}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#7A4A27,#8B5E34)' }}
        >
          + משימה חדשה
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#EDE0CE' }}>
        {([['board', 'לוח עבודה'], ['tasks', 'כל המשימות'], ['employees', 'ניהול עובדים']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
            style={tab === key
              ? { backgroundColor: '#fff', color: '#2B1A10', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
              : { color: '#7A5540' }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: '#8A735F' }}>טוען נתונים...</div>
      ) : (
        <>
          {/* ═══ TAB: לוח עבודה ═══════════════════════════════════════════════ */}
          {tab === 'board' && (
            <div className="space-y-4">
              {/* Status filter bar */}
              <div className="flex gap-2 flex-wrap">
                {([['all', 'הכל'], ...ALL_STATUSES.map(s => [s, STATUS_CFG[s].label])] as [string, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setBoardFilter(val as TaskStatus | 'all')}
                    className="px-3 py-1 rounded-full text-[12px] font-medium transition-all"
                    style={boardFilter === val
                      ? { backgroundColor: '#8B5E34', color: '#fff' }
                      : { backgroundColor: '#EDE0CE', color: '#7A5540' }}
                  >
                    {label}
                    {val !== 'all' && (
                      <span className="mr-1 opacity-70">
                        ({tasks.filter(t => t.סטטוס === val).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Employee columns */}
              <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollSnapType: 'x mandatory' }}>
                {/* Active employees */}
                {activeEmployees.map(emp => {
                  const empTasks = boardTasks
                    .filter(t => t.עובד_id === emp.id)
                    .sort((a, b) => {
                      if (a.עדיפות === 'דחוף' && b.עדיפות !== 'דחוף') return -1;
                      if (b.עדיפות === 'דחוף' && a.עדיפות !== 'דחוף') return 1;
                      return (a.תאריך_יעד || '9999') > (b.תאריך_יעד || '9999') ? 1 : -1;
                    });
                  return (
                    <EmployeeColumn
                      key={emp.id}
                      employee={emp}
                      tasks={empTasks}
                      onAddTask={() => openAddTask(emp.id)}
                      onEditTask={openEditTask}
                      onStatusChange={updateTaskStatus}
                      onDelete={deleteTask}
                    />
                  );
                })}

                {/* Unassigned column */}
                {unassigned.length > 0 && (
                  <div
                    className="flex-shrink-0 rounded-2xl p-3 space-y-2"
                    style={{ width: 268, backgroundColor: '#F0EBE3', border: '1px solid #DDD0C0', scrollSnapAlign: 'start' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-bold text-[13px]" style={{ color: '#2B1A10' }}>ללא עובד מוקצה</p>
                        <p className="text-[11px]" style={{ color: '#8A735F' }}>{unassigned.length} משימות</p>
                      </div>
                      <button onClick={() => openAddTask()} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: '#EDE0CE', color: '#7A4A27' }}>
                        + משימה
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto">
                      {unassigned.map(task => (
                        <TaskCard key={task.id} task={task} onEdit={openEditTask} onStatusChange={updateTaskStatus} onDelete={deleteTask} />
                      ))}
                    </div>
                  </div>
                )}

                {activeEmployees.length === 0 && unassigned.length === 0 && (
                  <div className="w-full text-center py-12 text-sm" style={{ color: '#8A735F' }}>
                    אין עובדים פעילים עדיין.{' '}
                    <button onClick={() => setTab('employees')} className="underline" style={{ color: '#8B5E34' }}>הוסף עובד</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TAB: כל המשימות ═══════════════════════════════════════════════ */}
          {tab === 'tasks' && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <select
                  className="rounded-lg border px-3 py-1.5 text-[13px]"
                  style={{ borderColor: '#DDD0C0', color: '#2B1A10', backgroundColor: '#FFFCF7' }}
                  value={taskEmpFilter}
                  onChange={e => setTaskEmpFilter(e.target.value)}
                >
                  <option value="">כל העובדים</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.שם_עובד}</option>)}
                </select>
                <select
                  className="rounded-lg border px-3 py-1.5 text-[13px]"
                  style={{ borderColor: '#DDD0C0', color: '#2B1A10', backgroundColor: '#FFFCF7' }}
                  value={taskStatusFilter}
                  onChange={e => setTaskStatusFilter(e.target.value as TaskStatus | '')}
                >
                  <option value="">כל הסטטוסים</option>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                </select>
                <span className="self-center text-[12px]" style={{ color: '#8A735F' }}>{filteredTasksList.length} משימות</span>
              </div>

              {filteredTasksList.length === 0 ? (
                <p className="text-center py-10 text-sm" style={{ color: '#8A735F' }}>אין משימות להצגה.</p>
              ) : (
                <Card>
                  <div className="space-y-1">
                    {filteredTasksList.map(task => (
                      <TaskListRow
                        key={task.id}
                        task={task}
                        onEdit={openEditTask}
                        onStatusChange={updateTaskStatus}
                        onDelete={deleteTask}
                      />
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ═══ TAB: ניהול עובדים ═══════════════════════════════════════════ */}
          {tab === 'employees' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={openAddEmp}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#7A4A27,#8B5E34)' }}
                >
                  + הוסף עובד
                </button>
              </div>

              {employees.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: '#8A735F' }}>עדיין אין עובדים. לחץ "הוסף עובד" כדי להתחיל.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {employees.map(emp => {
                    const empTaskCount = tasks.filter(t => t.עובד_id === emp.id && (t.סטטוס === 'ממתין' || t.סטטוס === 'בעבודה')).length;
                    return (
                      <Card key={emp.id} style={{ opacity: emp.פעיל ? 1 : 0.55 }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[14px]" style={{ color: '#2B1A10' }}>{emp.שם_עובד}</span>
                              {!emp.פעיל && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F0EBE3', color: '#8A735F', border: '1px solid #DDD0C0' }}>לא פעיל</span>
                              )}
                            </div>
                            {emp.תפקיד && <p className="text-[12px] mt-0.5" style={{ color: '#7A5540' }}>{emp.תפקיד}</p>}
                            {emp.טלפון && <p className="text-[12px] mt-1 tabular-nums" style={{ color: '#8A735F' }}>{emp.טלפון}</p>}
                            {emp.אימייל && <p className="text-[11.5px] mt-0.5 truncate" style={{ color: '#8A735F' }}>{emp.אימייל}</p>}
                            {empTaskCount > 0 && (
                              <p className="text-[11px] mt-2 font-medium" style={{ color: '#8B5E34' }}>
                                {empTaskCount} {empTaskCount === 1 ? 'משימה פתוחה' : 'משימות פתוחות'}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => openEditEmp(emp)}
                              className="text-[11px] px-2 py-1 rounded-lg"
                              style={{ backgroundColor: '#F0EBE3', color: '#7A4A27', border: '1px solid #DDD0C0' }}
                            >
                              ערוך
                            </button>
                            <button
                              onClick={() => toggleEmpActive(emp)}
                              className="text-[11px] px-2 py-1 rounded-lg"
                              style={{ backgroundColor: emp.פעיל ? '#FFF8E6' : '#EEF7EE', color: emp.פעיל ? '#7A5200' : '#1E5C31', border: `1px solid ${emp.פעיל ? '#F0D870' : '#A8D5B5'}` }}
                            >
                              {emp.פעיל ? 'השבת' : 'הפעל'}
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ EMPLOYEE MODAL ════════════════════════════════════════════════════ */}
      {showEmpModal && (
        <ModalOverlay onClose={() => setShowEmpModal(false)}>
          <h2 className="text-[15px] font-bold mb-4" style={{ color: '#2B1A10' }}>
            {editEmp ? 'עריכת עובד' : 'הוספת עובד'}
          </h2>
          <div className="space-y-3">
            <FormField label="שם עובד *">
              <input
                className="w-full rounded-lg border px-3 py-2 text-[13px]"
                style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                value={empForm.שם_עובד}
                onChange={e => setEmpForm(f => ({ ...f, שם_עובד: e.target.value }))}
                placeholder="שם מלא"
              />
            </FormField>
            <FormField label="תפקיד">
              <input
                className="w-full rounded-lg border px-3 py-2 text-[13px]"
                style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                value={empForm.תפקיד}
                onChange={e => setEmpForm(f => ({ ...f, תפקיד: e.target.value }))}
                placeholder="לדוג׳ מכינה"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="טלפון">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={empForm.טלפון}
                  onChange={e => setEmpForm(f => ({ ...f, טלפון: e.target.value }))}
                  placeholder="050-..."
                  dir="ltr"
                />
              </FormField>
              <FormField label="אימייל">
                <input
                  type="email"
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={empForm.אימייל}
                  onChange={e => setEmpForm(f => ({ ...f, אימייל: e.target.value }))}
                  placeholder="name@example.com"
                  dir="ltr"
                />
              </FormField>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={saveEmployee}
              disabled={savingEmp}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: savingEmp ? '#C5A882' : 'linear-gradient(135deg,#7A4A27,#8B5E34)', cursor: savingEmp ? 'not-allowed' : 'pointer' }}
            >
              {savingEmp ? 'שומר...' : 'שמור'}
            </button>
            <button
              onClick={() => setShowEmpModal(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ backgroundColor: '#F4EDE3', color: '#7A4A27', border: '1px solid #E8D2A8' }}
            >
              ביטול
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ═══ TASK MODAL ════════════════════════════════════════════════════════ */}
      {showTaskModal && (
        <ModalOverlay onClose={() => setShowTaskModal(false)}>
          <h2 className="text-[15px] font-bold mb-4" style={{ color: '#2B1A10' }}>
            {editTask ? 'עריכת משימה' : 'משימה חדשה'}
          </h2>
          <div className="space-y-3">
            <FormField label="שם משימה *">
              <input
                className="w-full rounded-lg border px-3 py-2 text-[13px]"
                style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                value={taskForm.שם_משימה}
                onChange={e => setTaskForm(f => ({ ...f, שם_משימה: e.target.value }))}
                placeholder="לדוג׳ להכין מארז פטיפורים"
              />
            </FormField>
            <FormField label="פירוט (אופציונלי)">
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-[13px] resize-none"
                style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                rows={2}
                value={taskForm.פירוט}
                onChange={e => setTaskForm(f => ({ ...f, פירוט: e.target.value }))}
                placeholder="פרטים נוספים..."
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="עובד">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={taskForm.עובד_id}
                  onChange={e => setTaskForm(f => ({ ...f, עובד_id: e.target.value }))}
                >
                  <option value="">ללא עובד</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.שם_עובד}</option>)}
                </select>
              </FormField>
              <FormField label="עדיפות">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={taskForm.עדיפות}
                  onChange={e => setTaskForm(f => ({ ...f, עדיפות: e.target.value as TaskPriority }))}
                >
                  <option value="רגיל">רגיל</option>
                  <option value="דחוף">דחוף</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="תאריך יעד">
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={taskForm.תאריך_יעד}
                  onChange={e => setTaskForm(f => ({ ...f, תאריך_יעד: e.target.value }))}
                />
              </FormField>
              <FormField label="שעה">
                <input
                  type="time"
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={taskForm.שעת_יעד}
                  onChange={e => setTaskForm(f => ({ ...f, שעת_יעד: e.target.value }))}
                />
              </FormField>
            </div>
            {editTask && (
              <FormField label="סטטוס">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                  value={taskForm.סטטוס as string}
                  onChange={e => setTaskForm(f => ({ ...f, סטטוס: e.target.value as TaskStatus }))}
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="הערות">
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-[13px] resize-none"
                style={{ borderColor: '#E8D2A8', backgroundColor: '#FFFCF7', color: '#2B1A10' }}
                rows={2}
                value={taskForm.הערות}
                onChange={e => setTaskForm(f => ({ ...f, הערות: e.target.value }))}
                placeholder="הערות נוספות..."
              />
            </FormField>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={saveTask}
              disabled={savingTask}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: savingTask ? '#C5A882' : 'linear-gradient(135deg,#7A4A27,#8B5E34)', cursor: savingTask ? 'not-allowed' : 'pointer' }}
            >
              {savingTask ? 'שומר...' : 'שמור'}
            </button>
            <button
              onClick={() => setShowTaskModal(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ backgroundColor: '#F4EDE3', color: '#7A4A27', border: '1px solid #E8D2A8' }}
            >
              ביטול
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl p-6"
        style={{ backgroundColor: '#FFFDF8', border: '1px solid #E8D2A8', direction: 'rtl', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#7A4A27' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function EmployeeColumn({
  employee, tasks, onAddTask, onEditTask, onStatusChange, onDelete,
}: {
  employee: Employee;
  tasks: WorkTask[];
  onAddTask: () => void;
  onEditTask: (t: WorkTask) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="flex-shrink-0 rounded-2xl p-3 flex flex-col gap-2"
      style={{ width: 268, backgroundColor: '#FFFDF8', border: '1px solid #EAE0D4', scrollSnapAlign: 'start' }}
    >
      {/* Employee header */}
      <div className="flex items-start justify-between pb-2" style={{ borderBottom: '1px solid #EAE0D4' }}>
        <div className="min-w-0">
          <p className="font-bold text-[13px]" style={{ color: '#2B1A10' }}>{employee.שם_עובד}</p>
          {employee.תפקיד && <p className="text-[11px]" style={{ color: '#8A735F' }}>{employee.תפקיד}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F4E8D8', color: '#7A4A27' }}>
            {tasks.length}
          </span>
          <button
            onClick={onAddTask}
            className="text-[11px] px-2 py-0.5 rounded-lg font-medium"
            style={{ backgroundColor: '#F4E8D8', color: '#7A4A27', border: '1px solid #E8D2A8' }}
          >
            + משימה
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 480 }}>
        {tasks.length === 0 ? (
          <p className="text-center text-[12px] py-6" style={{ color: '#B09A84' }}>אין משימות</p>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} onEdit={onEditTask} onStatusChange={onStatusChange} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task, onEdit, onStatusChange, onDelete,
}: {
  task: WorkTask;
  onEdit: (t: WorkTask) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = isOverdue(task);
  const isDone  = task.סטטוס === 'הושלם' || task.סטטוס === 'בוטל';

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{
        backgroundColor: isDone ? '#F6F4F0' : '#FFFDF8',
        border: `1px solid ${overdue ? '#F2AAAA' : '#EAE0D4'}`,
        opacity: isDone ? 0.72 : 1,
      }}
    >
      {/* Title row */}
      <div className="flex items-start gap-1.5 flex-wrap">
        <PriorityBadge priority={task.עדיפות} />
        <StatusBadge status={task.סטטוס} />
        {overdue && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FFF0F0', color: '#8B1C1C', border: '1px solid #F2AAAA' }}>
            באיחור
          </span>
        )}
      </div>
      <p className="text-[13px] font-semibold leading-snug" style={{ color: '#2B1A10' }}>
        {task.שם_משימה}
      </p>

      {/* Order link */}
      {task.הזמנות && (
        <Link
          href={`/orders/${task.הזמנה_id}`}
          className="text-[11px] hover:underline"
          style={{ color: '#8B5E34' }}
        >
          הזמנה #{task.הזמנות.מספר_הזמנה}
        </Link>
      )}

      {/* Due date */}
      {task.תאריך_יעד && (
        <p className="text-[11px]" style={{ color: overdue ? '#8B1C1C' : '#8A735F' }}>
          {task.שעת_יעד ? `${task.שעת_יעד} · ` : ''}{formatDate(task.תאריך_יעד)}
        </p>
      )}

      {/* Quick status actions */}
      {!isDone && (
        <div className="flex gap-1.5 pt-0.5">
          {task.סטטוס === 'ממתין' && (
            <button
              onClick={() => onStatusChange(task.id, 'בעבודה')}
              className="flex-1 rounded-lg py-1 text-[11px] font-semibold"
              style={{ backgroundColor: '#FFF8E6', color: '#7A5200', border: '1px solid #F0D870' }}
            >
              התחל עבודה
            </button>
          )}
          {task.סטטוס === 'בעבודה' && (
            <button
              onClick={() => onStatusChange(task.id, 'ממתין')}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: '#EEF3FB', color: '#1E4E8C', border: '1px solid #C5D9F2' }}
            >
              הפסק
            </button>
          )}
          <button
            onClick={() => onStatusChange(task.id, 'הושלם')}
            className="flex-1 rounded-lg py-1 text-[11px] font-semibold"
            style={{ backgroundColor: '#EEF7EE', color: '#1E5C31', border: '1px solid #A8D5B5' }}
          >
            הושלם
          </button>
        </div>
      )}

      {/* Edit / delete row */}
      <div className="flex gap-2 pt-0.5">
        <button onClick={() => onEdit(task)} className="text-[10px]" style={{ color: '#8A735F' }}>ערוך</button>
        <button onClick={() => onDelete(task.id)} className="text-[10px]" style={{ color: '#C47A7A' }}>מחק</button>
      </div>
    </div>
  );
}

function TaskListRow({
  task, onEdit, onStatusChange, onDelete,
}: {
  task: WorkTask;
  onEdit: (t: WorkTask) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px]"
      style={{ backgroundColor: '#FAF7F0', borderRight: `3px solid ${overdue ? '#F2AAAA' : STATUS_CFG[task.סטטוס].border}` }}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold" style={{ color: '#2B1A10' }}>{task.שם_משימה}</span>
          <PriorityBadge priority={task.עדיפות} />
          {overdue && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FFF0F0', color: '#8B1C1C' }}>
              באיחור
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] flex-wrap" style={{ color: '#8A735F' }}>
          {task.עובדים && <span>{task.עובדים.שם_עובד}</span>}
          {task.הזמנות && (
            <Link href={`/orders/${task.הזמנה_id}`} className="hover:underline" style={{ color: '#8B5E34' }}>
              #{task.הזמנות.מספר_הזמנה}
            </Link>
          )}
          {task.תאריך_יעד && <span>{task.שעת_יעד ? `${task.שעת_יעד} · ` : ''}{formatDate(task.תאריך_יעד)}</span>}
        </div>
      </div>
      <StatusBadge status={task.סטטוס} />
      <select
        className="rounded-lg border px-2 py-1 text-[11px]"
        style={{ borderColor: '#DDD0C0', color: '#2B1A10', backgroundColor: '#FFFCF7' }}
        value={task.סטטוס}
        onChange={e => onStatusChange(task.id, e.target.value as TaskStatus)}
      >
        {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
      </select>
      <button onClick={() => onEdit(task)} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: '#F0EBE3', color: '#7A4A27', border: '1px solid #DDD0C0' }}>
        ערוך
      </button>
      <button onClick={() => onDelete(task.id)} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: '#FFF0F0', color: '#8B1C1C', border: '1px solid #F2AAAA' }}>
        מחק
      </button>
    </div>
  );
}
