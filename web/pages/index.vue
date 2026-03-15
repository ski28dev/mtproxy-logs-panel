<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
  middleware: ['auth']
});

const api = useApi();
const { admin, logout } = useAuth();

const summary = ref<any>(null);
const secrets = ref<any[]>([]);
const selectedSecret = ref<any | null>(null);
const selectedStats = ref<any | null>(null);
const events = ref<any[]>([]);
const detailsTab = ref<'events' | 'hourly' | 'daily'>('events');
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

async function rotateSecret(secret: any) {
  await api(`/secrets/${secret.id}/rotate`, { method: 'POST' });
  await loadDashboard();
  if (selectedSecret.value?.id === secret.id) {
    await refreshSelectedSecretDetails();
  }
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
  loading.stats = true;
  try {
    const [eventsResponse, statsResponse] = await Promise.all([
      api<any>(`/secrets/${secret.id}/events`),
      api<any>(`/secrets/${secret.id}/stats`)
    ]);
    events.value = eventsResponse.events;
    selectedStats.value = statsResponse.stats;
  } finally {
    loading.events = false;
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
        <h1>Кабинет управления secret-ссылками</h1>
      </div>

      <div class="header-actions">
        <div class="admin-chip">{{ admin?.username || 'admin' }}</div>
        <button class="ghost-button" @click="manualSync" :disabled="loading.sync">
          {{ loading.sync ? 'Синхронизация…' : 'Синхронизировать MTProxy' }}
        </button>
        <button class="ghost-button" @click="logout">Выход</button>
      </div>
    </header>

    <section class="stats-grid" v-if="summary">
      <article class="stat-card">
        <span>Всего ссылок</span>
        <strong>{{ summary.totals.total_secrets }}</strong>
      </article>
      <article class="stat-card">
        <span>Активные</span>
        <strong>{{ summary.totals.active_secrets }}</strong>
      </article>
      <article class="stat-card">
        <span>Уникальные IP за окно</span>
        <strong>{{ summary.uniqueIpsWindow }}</strong>
      </article>
      <article class="stat-card">
        <span>Последний импорт логов</span>
        <strong>{{ summary.lastLogImportAt ? new Date(summary.lastLogImportAt).toLocaleString() : '—' }}</strong>
      </article>
    </section>

    <section class="panel-grid">
      <article class="panel-card table-card">
        <div class="panel-head">
          <h2>Ссылки</h2>
          <div class="header-actions">
            <span class="muted">{{ filteredSecrets.length }} шт.</span>
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
                    <th>Метка</th>
                    <th>Группа</th>
                    <th>Статус</th>
                    <th>IP</th>
                    <th>Подкл.</th>
                    <th>Активно</th>
                    <th>Слот</th>
                    <th>Последняя активность</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="secret in group.secrets" :key="secret.id">
                    <td>
                      <strong>{{ secret.label }}</strong>
                      <div class="muted small">{{ secret.maxUniqueIps }} IP лимит</div>
                      <button class="mini-button cell-button" @click="showSecret(secret)">Открыть</button>
                    </td>
                    <td>
                      <div>{{ secret.groupName || '—' }}</div>
                      <button class="mini-button cell-button" @click="openEditModal(secret)" :disabled="loading.meta">
                        Редактировать
                      </button>
                    </td>
                    <td>
                      <span :class="['status-pill', secret.status]">{{ statusLabel(secret.status) }}</span>
                      <button class="mini-button cell-button" @click="rotateSecret(secret)">Обновить</button>
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
                    <td>{{ secret.currentSlot ?? '—' }}</td>
                    <td>{{ secret.lastSeenAt ? new Date(secret.lastSeenAt).toLocaleString() : '—' }}</td>
                    <td class="row-actions">
                      <button class="mini-button" @click="openEditModal(secret)" :disabled="loading.meta">
                        Редактировать профиль
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
          <h2>{{ selectedSecret.label }}</h2>
          <p class="muted">{{ selectedSecret.proxyLink }}</p>
        </div>
        <button class="ghost-button copy-button" @click="copyProxyLink(selectedSecret)">Копировать ссылку</button>
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

      <div class="history-grid" v-if="selectedStats && detailsTab !== 'events'">
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
              <tr v-else v-for="item in selectedStats.historyHourly" :key="item.bucketStart">
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
              <tr v-else v-for="item in selectedStats.historyDaily" :key="item.bucketStart">
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
              <th>Слот</th>
              <th>FD</th>
              <th>Длительность</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading.events">
              <td colspan="6">Загружаем…</td>
            </tr>
            <tr v-else-if="events.length === 0">
              <td colspan="6">Событий пока нет</td>
            </tr>
            <tr v-for="event in events" :key="event.id">
              <td>{{ eventLabel(event.event_type) }}</td>
              <td>{{ event.client_ip }}</td>
              <td>{{ event.slot_index }}</td>
              <td>{{ event.connection_fd ?? '—' }}</td>
              <td>{{ event.duration_seconds ? `${event.duration_seconds} c` : '—' }}</td>
              <td>{{ new Date(event.connected_at).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
