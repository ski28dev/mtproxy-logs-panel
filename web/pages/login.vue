<script setup lang="ts">
definePageMeta({
  layout: 'default'
});

const form = reactive({
  username: '',
  password: ''
});
const errorMessage = ref('');
const loading = ref(false);
const { login, token, hydrate } = useAuth();

hydrate();

if (token.value) {
  navigateTo('/');
}

async function submit() {
  errorMessage.value = '';
  loading.value = true;

  try {
    await login(form);
    await navigateTo('/');
  } catch (error: any) {
    errorMessage.value = error?.data?.message || 'Не удалось войти';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="eyebrow">Управление MTProto</div>
      <h1>Вход в кабинет</h1>
      <p class="muted">
        Панель управляет отдельными MTProto secret-ссылками, их статусом и IP-активностью.
      </p>

      <form class="form-grid" @submit.prevent="submit">
        <label class="field">
          <span>Логин</span>
          <input v-model="form.username" type="text" autocomplete="username" required />
        </label>

        <label class="field">
          <span>Пароль</span>
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>

        <button class="primary-button" type="submit" :disabled="loading">
          {{ loading ? 'Входим…' : 'Войти' }}
        </button>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </form>
    </section>
  </main>
</template>
