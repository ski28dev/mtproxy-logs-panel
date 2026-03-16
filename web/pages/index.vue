<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
  middleware: ['auth']
});

const api = useApi();
const { admin, logout } = useAuth();

const summary = ref<any>(null);
const mtproxyHealth = ref<any>(null);
const secrets = ref<any[]>([]);
const selectedSecret = ref<any | null>(null);
const selectedStats = ref<any | null>(null);
const events = ref<any[]>([]);
const uniqueIps = ref<any[]>([]);
const detailsTab = ref<'events' | 'ips' | 'hourly' | 'daily'>('events');
const detailsSection = ref<HTMLElement | null>(null);
const isCreateModalOpen = ref(false);
const editingSecretId = ref<number | null>(null);
const isEditModalOpen = ref(false);
const collapsedGroups = reactive<Record<string, boolean>>({});
const searchQuery = ref('');
const selectedGroup = ref('all');
const loading = reactive({
  dashboard: true,
  create: false,
  sync: false,
  events: false,
  ips: false,
  stats: false,
  meta: false
});

const createForm = reactive({
  label: '',
  groupName: '',
  note: '',
  maxUniqueIps: 10
});
const createGroupOption = ref('');
const createCustomGroup = ref('');
const editForm = reactive({
  label: '',
  maxUniqueIps: 10
});
const editGroupOption = ref('');
const editCustomGroup = ref('');

const syncMessage = ref('');
const errorMessage = ref('');

function statusLabel(status: string) {
  if (status === 'active') {
    return 'Активна';
  }
  if (status === 'revoked') {
    return 'Отключена';
  }
  return status;
}

function eventLabel(eventType: string) {
  if (eventType === 'handshake_ok') {
    return 'Подключение';
  }
  if (eventType === 'disconnect') {
    return 'Отключение';
  }
  return eventType;
}

async function copyProxyLink(secret: any) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(secret.proxyLink);
    } else {
      const input = document.createElement('textarea');
      input.value = secret.proxyLink;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.top = '0';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      if (!ok) {
        throw new Error('copy failed');
      }
    }
    toast.success('Ссылка скопирована');
  } catch {
    toast.error('Не удалось скопировать ссылку');
  }
}

const availableGroups = computed(() => {
  const groups = new Set<string>();
  for (const secret of secrets.value) {
    if (secret.groupName) {
      groups.add(secret.groupName);
    }
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b, 'ru'));
});

const GROUPLESS_KEY = '__ungrouped__';

function groupDisplayName(groupKey: string) {
  return groupKey === GROUPLESS_KEY ? 'Без группы' : groupKey;
}

const filteredSecrets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return secrets.value.filter((secret) => {
    const matchesGroup = selectedGroup.value === 'all' || secret.groupName === selectedGroup.value;
    if (!matchesGroup) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [secret.label, secret.groupName || '', secret.note || ''].join(' ').toLowerCase();
    return haystack.includes(query);
  });
});

const selectedHourlyHistory = computed(() =>
  selectedStats.value?.historyHourly ? [...selectedStats.value.historyHourly].reverse() : []
);

const selectedDailyHistory = computed(() =>
  selectedStats.value?.historyDaily ? [...selectedStats.value.historyDaily].reverse() : []
);

const groupedSecrets = computed(() => {
  const groups = new Map<string, any[]>();

  for (const secret of filteredSecrets.value) {
    const key = secret.groupName?.trim() || GROUPLESS_KEY;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(secret);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === GROUPLESS_KEY) return 1;
      if (right === GROUPLESS_KEY) return -1;
      return left.localeCompare(right, 'ru');
    })
    .map(([key, secrets]) => ({
      key,
      name: groupDisplayName(key),
      secrets
    }));
});

watchEffect(() => {
  for (const group of groupedSecrets.value) {
    if (!(group.key in collapsedGroups)) {
      collapsedGroups[group.key] = true;
    }
  }
});

function toggleGroup(groupKey: string) {
  collapsedGroups[groupKey] = !collapsedGroups[groupKey];
}

async function loadDashboard() {
  loading.dashboard = true;
  errorMessage.value = '';
  try {
    const [statusResponse, secretsResponse] = await Promise.all([
      api<any>('/system/status'),
      api<any>('/secrets')
    ]);
    summary.value = statusResponse.summary;
    mtproxyHealth.value = statusResponse.health;
    secrets.value = secretsResponse.secrets;
  } catch (error: any) {
    errorMessage.value = error?.data?.message || 'Не удалось загрузить данные';
  } finally {
    loading.dashboard = false;
  }
}

async function refreshSelectedSecretDetails() {
  if (!selectedSecret.value) {
    return;
  }
  const updatedSecret = secrets.value.find((secret) => secret.id === selectedSecret.value.id) || selectedSecret.value;
  await showSecret(updatedSecret);
}

function resetCreateForm() {
  createForm.label = '';
  createForm.groupName = '';
  createForm.note = '';
  createForm.maxUniqueIps = 10;
  createGroupOption.value = '';
  createCustomGroup.value = '';
}

function openCreateModal() {
  resetCreateForm();
  isCreateModalOpen.value = true;
}

function closeCreateModal() {
  isCreateModalOpen.value = false;
}

function openEditModal(secret: any) {
  editingSecretId.value = secret.id;
  editForm.label = secret.label || '';
  editForm.maxUniqueIps = secret.maxUniqueIps || 10;
  editGroupOption.value = secret.groupName || '';
  editCustomGroup.value = '';
  isEditModalOpen.value = true;
}

function closeEditModal() {
  editingSecretId.value = null;
  isEditModalOpen.value = false;
  editForm.label = '';
  editForm.maxUniqueIps = 10;
  editGroupOption.value = '';
  editCustomGroup.value = '';
}

async function createSecret() {
  loading.create = true;
  syncMessage.value = '';
  try {
    const groupName =
      createGroupOption.value === '__new__'
        ? createCustomGroup.value.trim()
        : createGroupOption.value;

    await api('/secrets', {
      method: 'POST',
      body: {
        ...createForm,
        groupName
      }
    });
    resetCreateForm();
    closeCreateModal();
    await loadDashboard();
    syncMessage.value = 'Ссылка создана, синхронизация запущена';
    toast.success('Ссылка создана');
  } catch (error: any) {
    errorMessage.value = error?.data?.message || 'Не удалось создать ссылку';
    toast.error(errorMessage.value);
  } finally {
    loading.create = false;
  }
}

async function saveSecretMeta() {
  if (!editingSecretId.value) {
    return;
  }
  loading.meta = true;
  errorMessage.value = '';

  try {
    const secret = secrets.value.find((item) => item.id === editingSecretId.value);
    const groupName =
      editGroupOption.value === '__new__'
        ? editCustomGroup.value.trim()
        : editGroupOption.value;

    await api(`/secrets/${editingSecretId.value}/meta`, {
      method: 'PATCH',
      body: {
        label: editForm.label.trim(),
        groupName,
        note: secret.note || '',
        maxUniqueIps: editForm.maxUniqueIps
      }
    });
    await loadDashboard();
    await refreshSelectedSecretDetails();
    closeEditModal();
    toast.success('Профиль обновлён');
  } catch (error: any) {
    errorMessage.value = error?.data?.message || 'Не удалось обновить профиль';
    toast.error(errorMessage.value);
  } finally {
    loading.meta = false;
  }
}

async function toggleSecret(secret: any) {
  const action = secret.status === 'active' ? 'revoke' : 'activate';
  await api(`/secrets/${secret.id}/${action}`, { method: 'POST' });
  await loadDashboard();
  if (selectedSecret.value?.id === secret.id) {
    await refreshSelectedSecretDetails();
  }
}

async function refreshSecret(secret: any) {
  await loadDashboard();
  if (selectedSecret.value?.id === secret.id) {
    await refreshSelectedSecretDetails();
  }
  toast.success('Данные обновлены');
}

async function deleteSecret(secret: any) {
  const confirmed = window.confirm(`Точно удалить ${secret.label}?`);
  if (!confirmed) {
    return;
  }

  await api(`/secrets/${secret.id}`, { method: 'DELETE' });
  if (selectedSecret.value?.id === secret.id) {
    selectedSecret.value = null;
    selectedStats.value = null;
    events.value = [];
    uniqueIps.value = [];
  }
  await loadDashboard();
  toast.success('Ссылка удалена');
}

async function manualSync() {
  loading.sync = true;
  syncMessage.value = '';
  try {
    const response = await api<any>('/system/sync', { method: 'POST' });
    syncMessage.value = response.sync?.ok ? 'MTProxy перечитан' : response.sync?.message || 'Синхронизация не выполнена';
    if (response.sync?.ok) {
      toast.success('MTProxy синхронизирован');
    } else {
      toast.error(syncMessage.value);
    }
    await loadDashboard();
    await refreshSelectedSecretDetails();
  } finally {
    loading.sync = false;
  }
}

async function showSecret(secret: any) {
  selectedSecret.value = secret;
  detailsTab.value = 'events';
  await nextTick();
  detailsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loading.events = true;
  loading.ips = true;
  loading.stats = true;
  try {
    const [eventsResponse, uniqueIpsResponse, statsResponse] = await Promise.all([
      api<any>(`/secrets/${secret.id}/events`),
      api<any>(`/secrets/${secret.id}/unique-ips`),
      api<any>(`/secrets/${secret.id}/stats`)
    ]);
    events.value = eventsResponse.events;
    uniqueIps.value = uniqueIpsResponse.uniqueIps;
    selectedStats.value = statsResponse.stats;
  } finally {
    loading.events = false;
    loading.ips = false;
    loading.stats = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <main class="dashboard-shell">
    <header class="dashboard-header">
      <div>
        <div class="eyebrow">Панель MTProto</div>
      </div>

      <div class="header-actions">
        <div class="admin-chip">{{ admin?.username || 'admin' }}</div>
        <button class="ghost-button" @click="logout">Выход</button>
      </div>
    </header>

    <section v-if="mtproxyHealth" :class="['health-banner', mtproxyHealth.online ? 'online' : 'offline']">
      <div class="health-banner-main">
        <span class="health-dot" />
        <div>
          <strong>MTProxy {{ mtproxyHealth.online ? 'онлайн' : 'офлайн' }}</strong>
          <p>
            443: {{ mtproxyHealth.portListening ? 'слушает' : 'нет' }},
            watchdog: {{ mtproxyHealth.watchdogActive ? 'включён' : 'выключен' }}
          </p>
        </div>
      </div>
      <div class="health-banner-meta">
        <span>
          Последний handshake:
          {{ mtproxyHealth.lastHandshakeAt ? new Date(mtproxyHealth.lastHandshakeAt).toLocaleString() : '—' }}
        </span>
        <span>
          Последний авто-рестарт:
          {{ mtproxyHealth.lastAutoRestartAt ? mtproxyHealth.lastAutoRestartAt : '—' }}
        </span>
      </div>
    </section>

    <section v-if="summary" class="sync-banner">
      <button class="ghost-button sync-banner-button" @click="manualSync" :disabled="loading.sync">
        {{ loading.sync ? 'Синхронизация…' : 'Синхронизировать MTProxy' }}
      </button>
      <div class="sync-banner-meta">
        Последнее обновление:
        {{ summary.lastLogImportAt ? new Date(summary.lastLogImportAt).toLocaleString() : '—' }}
      </div>
    </section>

    <section class="stats-grid" v-if="summary">
      <article class="stat-card overview-stat-card">
        <span>Всего ссылок</span>
        <strong>{{ summary.totals.total_secrets }}</strong>
      </article>
      <article class="stat-card overview-stat-card">
        <span>Активные</span>
        <strong>{{ summary.totals.active_secrets }}</strong>
      </article>
      <article class="stat-card overview-stat-card">
        <span>Уникальные IP за 24 часа</span>
        <strong>{{ summary.uniqueIps24h }}</strong>
      </article>
      <article class="stat-card overview-stat-card">
        <span>Уникальные IP за 72 часа</span>
        <strong>{{ summary.uniqueIps72h }}</strong>
      </article>
    </section>

    <section class="panel-grid">
      <article class="panel-card table-card">
        <div class="panel-head">
          <h2>Ссылки</h2>
          <div class="header-actions">
            <button class="primary-button add-button" @click="openCreateModal">Добавить</button>
          </div>
        </div>

        <div class="header-actions table-filters">
          <input v-model="searchQuery" class="filter-input" type="text" placeholder="Поиск по метке, группе или примечанию" />
          <select v-model="selectedGroup" class="filter-select">
            <option value="all">Все группы</option>
            <option v-for="group in availableGroups" :key="group" :value="group">
              {{ group }}
            </option>
          </select>
        </div>

        <div v-if="groupedSecrets.length === 0" class="empty-state">
          Ничего не найдено по текущему фильтру.
        </div>

        <div v-else class="group-list">
          <section v-for="group in groupedSecrets" :key="group.key" class="group-section">
            <button class="group-toggle" type="button" @click="toggleGroup(group.key)">
              <div>
                <strong>{{ group.name }}</strong>
                <span>{{ group.secrets.length }} ссылок</span>
              </div>
              <span>{{ collapsedGroups[group.key] ? 'Развернуть' : 'Свернуть' }}</span>
            </button>

            <div v-if="!collapsedGroups[group.key]" class="table-wrap">
              <table class="secrets-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Действие</th>
                    <th>Метка</th>
                    <th>Статус</th>
                    <th>IP</th>
                    <th>Подкл.</th>
                    <th>Активно</th>
                    <th>Последняя активность</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="secret in group.secrets" :key="secret.id">
                    <td>
                      <div>{{ secret.id }}</div>
                    </td>
                    <td>
                      <button class="mini-button cell-button" @click="showSecret(secret)">Показать</button>
                    </td>
                    <td>
                      <strong>{{ secret.label }}</strong>
                      <div class="muted small">{{ secret.maxUniqueIps }} IP лимит</div>
                    </td>
                    <td>
                      <span :class="['status-pill', secret.status]">{{ statusLabel(secret.status) }}</span>
                    </td>
                    <td>
                      <strong>{{ secret.uniqueIpsWindow }}</strong>
                    </td>
                    <td>
                      <strong>{{ secret.handshakesWindow }}</strong>
                    </td>
                    <td>
                      <strong>{{ secret.activeConnectionsNow }}</strong>
                    </td>
                    <td>{{ secret.lastSeenAt ? new Date(secret.lastSeenAt).toLocaleString() : '—' }}</td>
                    <td class="row-actions">
                      <button class="mini-button success-mini-button icon-button" @click="refreshSecret(secret)" title="Обновить данные" aria-label="Обновить данные">
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            d="M16.2 10a6.2 6.2 0 1 1-1.82-4.38"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                          <path
                            d="M16.2 4.2v3.4h-3.4"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                        </svg>
                      </button>
                      <button class="mini-button icon-button" @click="openEditModal(secret)" :disabled="loading.meta" title="Редактировать профиль" aria-label="Редактировать профиль">
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            d="M4 13.8V16h2.2l7-7-2.2-2.2-7 7Z"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                          <path
                            d="M10.9 4.8 13.1 7m-1.1-3.3 1.1-1.1a1.56 1.56 0 1 1 2.2 2.2L14.2 6"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                        </svg>
                      </button>
                      <button class="mini-button danger-mini-button icon-button" @click="deleteSecret(secret)" title="Удалить" aria-label="Удалить">
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            d="M5.5 6.5h9"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                          <path
                            d="M7.5 6.5V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2v1.3"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                          <path
                            d="M6.8 6.5l.6 8.1c.05.77.69 1.4 1.47 1.4h2.3c.78 0 1.42-.63 1.47-1.4l.6-8.1"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                          <path
                            d="M8.8 9.2v4.2M11.2 9.2v4.2"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.8"
                          />
                        </svg>
                      </button>
                      <button
                        :class="['mini-button', secret.status === 'active' ? 'danger-mini-button' : 'success-mini-button']"
                        @click="toggleSecret(secret)"
                      >
                        {{ secret.status === 'active' ? 'Отключить' : 'Включить' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </article>
    </section>

    <div v-if="isCreateModalOpen" class="modal-backdrop" @click.self="closeCreateModal">
      <section class="modal-card">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Новая ссылка</div>
            <h2>Добавить пользователя</h2>
          </div>
          <button class="ghost-button" @click="closeCreateModal">Закрыть</button>
        </div>

        <form class="form-grid compact" @submit.prevent="createSecret">
          <label class="field">
            <span>Метка</span>
            <input v-model="createForm.label" type="text" placeholder="Например: Клиент 01" required />
          </label>

          <label class="field">
            <span>Группа</span>
            <select v-model="createGroupOption">
              <option value="">Без группы</option>
              <option v-for="group in availableGroups" :key="group" :value="group">
                {{ group }}
              </option>
              <option value="__new__">Новая группа</option>
            </select>
          </label>

          <label v-if="createGroupOption === '__new__'" class="field">
            <span>Название новой группы</span>
            <input v-model="createCustomGroup" type="text" placeholder="Например: Завод на Магистральной" />
          </label>

          <label class="field">
            <span>Примечание</span>
            <textarea v-model="createForm.note" rows="3" placeholder="Комментарий"></textarea>
          </label>

          <label class="field">
            <span>Лимит уникальных IP</span>
            <input v-model.number="createForm.maxUniqueIps" type="number" min="1" max="1000" />
          </label>

          <div class="modal-actions">
            <button class="ghost-button" type="button" @click="closeCreateModal">Отмена</button>
            <button class="primary-button" type="submit" :disabled="loading.create">
              {{ loading.create ? 'Создаём…' : 'Создать ссылку' }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="isEditModalOpen" class="modal-backdrop" @click.self="closeEditModal">
      <section class="modal-card">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Профиль</div>
            <h2>Редактировать пользователя</h2>
          </div>
          <button class="ghost-button" @click="closeEditModal">Закрыть</button>
        </div>

        <form class="form-grid compact" @submit.prevent="saveSecretMeta">
          <label class="field">
            <span>Имя</span>
            <input v-model="editForm.label" type="text" placeholder="Например: Клиент 01" required />
          </label>

          <label class="field">
            <span>Группа</span>
            <select v-model="editGroupOption">
              <option value="">Без группы</option>
              <option v-for="group in availableGroups" :key="group" :value="group">
                {{ group }}
              </option>
              <option value="__new__">Новая группа</option>
            </select>
          </label>

          <label v-if="editGroupOption === '__new__'" class="field">
            <span>Название новой группы</span>
            <input v-model="editCustomGroup" type="text" placeholder="Например: Завод на Магистральной" />
          </label>

          <label class="field">
            <span>Лимит уникальных IP</span>
            <input v-model.number="editForm.maxUniqueIps" type="number" min="1" max="1000" />
          </label>

          <div class="modal-actions">
            <button class="ghost-button" type="button" @click="closeEditModal">Отмена</button>
            <button class="primary-button" type="submit" :disabled="loading.meta">
              {{ loading.meta ? 'Сохраняем…' : 'Сохранить' }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <section v-if="selectedSecret" ref="detailsSection" class="panel-card">
      <div class="panel-head">
        <div>
          <h2>#{{ selectedSecret.id }} {{ selectedSecret.label }}</h2>
        </div>
      </div>

      <div v-if="selectedStats" class="secret-link-grid">
        <article class="stat-card compact-stat compact-link-card standalone-link-card">
          <span>Ссылка пользователя</span>
          <p class="muted compact-link-text">{{ selectedSecret.proxyLink }}</p>
          <button class="ghost-button copy-button compact-copy-button" @click="copyProxyLink(selectedSecret)">
            Копировать ссылку
          </button>
        </article>
      </div>

      <div v-if="selectedStats" class="secret-stats-grid">
        <article class="stat-card compact-stat">
          <span>Активных TCP сейчас</span>
          <strong>{{ selectedStats.current.activeConnectionsNow }}</strong>
        </article>
        <article class="stat-card compact-stat">
          <span>Handshake всего</span>
          <strong>{{ selectedStats.totals.handshakesTotal }}</strong>
        </article>
        <article class="stat-card compact-stat">
          <span>Уникальных IP всего</span>
          <strong>{{ selectedStats.totals.uniqueIpsTotal }}</strong>
        </article>
        <article class="stat-card compact-stat">
          <span>Последняя активность</span>
          <strong>{{ selectedStats.totals.lastSeenAt ? new Date(selectedStats.totals.lastSeenAt).toLocaleString() : '—' }}</strong>
        </article>
      </div>

      <div v-if="selectedStats" class="table-wrap history-wrap">
        <table class="secrets-table">
          <thead>
            <tr>
              <th>Окно</th>
              <th>Уникальные IP</th>
              <th>Handshake</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="window in selectedStats.windows" :key="window.hours">
              <td>{{ window.hours === 24 ? '24 часа' : window.hours === 72 ? '72 часа' : '7 дней' }}</td>
              <td>{{ window.uniqueIps }}</td>
              <td>{{ window.handshakes }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="details-tabs">
        <button
          type="button"
          :class="['tab-button', { active: detailsTab === 'events' }]"
          @click="detailsTab = 'events'"
        >
          События
        </button>
        <button
          type="button"
          :class="['tab-button', { active: detailsTab === 'ips' }]"
          @click="detailsTab = 'ips'"
        >
          Уникальные IP
        </button>
        <button
          type="button"
          :class="['tab-button', { active: detailsTab === 'hourly' }]"
          @click="detailsTab = 'hourly'"
        >
          История по часам за 24 часа
        </button>
        <button
          type="button"
          :class="['tab-button', { active: detailsTab === 'daily' }]"
          @click="detailsTab = 'daily'"
        >
          История по дням за 14 дней
        </button>
      </div>

      <div class="history-grid" v-if="selectedStats && detailsTab !== 'events' && detailsTab !== 'ips'">
        <div class="table-wrap" v-if="detailsTab === 'hourly'">
          <table class="secrets-table">
            <thead>
              <tr>
                <th colspan="5">История по часам за 24 часа</th>
              </tr>
              <tr>
                <th>Час</th>
                <th>Уникальные IP</th>
                <th>Handshake</th>
                <th>Активно к концу</th>
                <th>Пик</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading.stats">
                <td colspan="5">Загружаем…</td>
              </tr>
              <tr v-else v-for="item in selectedHourlyHistory" :key="item.bucketStart">
                <td>{{ new Date(item.bucketStart).toLocaleString() }}</td>
                <td>{{ item.uniqueIps }}</td>
                <td>{{ item.handshakes }}</td>
                <td>{{ item.activeConnectionsEnd }}</td>
                <td>{{ item.activeConnectionsPeak }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="table-wrap" v-if="detailsTab === 'daily'">
          <table class="secrets-table">
            <thead>
              <tr>
                <th colspan="5">История по дням за 14 дней</th>
              </tr>
              <tr>
                <th>День</th>
                <th>Уникальные IP</th>
                <th>Handshake</th>
                <th>Активно к концу</th>
                <th>Пик</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading.stats">
                <td colspan="5">Загружаем…</td>
              </tr>
              <tr v-else v-for="item in selectedDailyHistory" :key="item.bucketStart">
                <td>{{ new Date(item.bucketStart).toLocaleDateString() }}</td>
                <td>{{ item.uniqueIps }}</td>
                <td>{{ item.handshakes }}</td>
                <td>{{ item.activeConnectionsEnd }}</td>
                <td>{{ item.activeConnectionsPeak }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-wrap" v-if="detailsTab === 'events'">
        <table class="secrets-table">
          <thead>
            <tr>
              <th>Событие</th>
              <th>IP</th>
              <th>FD</th>
              <th>Длительность</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading.events">
              <td colspan="5">Загружаем…</td>
            </tr>
            <tr v-else-if="events.length === 0">
              <td colspan="5">Событий пока нет</td>
            </tr>
            <tr v-for="event in events" :key="event.id">
              <td>{{ eventLabel(event.event_type) }}</td>
              <td>{{ event.client_ip }}</td>
              <td>{{ event.connection_fd ?? '—' }}</td>
              <td>{{ event.duration_seconds ? `${event.duration_seconds} c` : '—' }}</td>
              <td>{{ new Date(event.connected_at).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap" v-if="detailsTab === 'ips'">
        <table class="secrets-table">
          <thead>
            <tr>
              <th>IP</th>
              <th>Handshake</th>
              <th>Отключений</th>
              <th>Первая активность</th>
              <th>Последняя активность</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading.ips">
              <td colspan="5">Загружаем…</td>
            </tr>
            <tr v-else-if="uniqueIps.length === 0">
              <td colspan="5">Уникальных IP пока нет</td>
            </tr>
            <tr v-for="ip in uniqueIps" :key="ip.client_ip">
              <td>{{ ip.client_ip }}</td>
              <td>{{ ip.handshakes_count }}</td>
              <td>{{ ip.disconnects_count }}</td>
              <td>{{ ip.first_seen_at ? new Date(ip.first_seen_at).toLocaleString() : '—' }}</td>
              <td>{{ ip.last_seen_at ? new Date(ip.last_seen_at).toLocaleString() : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
