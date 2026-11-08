# Controle de Pagamentos de Campanhas 🐾

Site simples para acompanhar quem já pagou a contribuição do mês em cada campanha.

- **Visitantes** (sem cadastro) tocam no próprio nome e enviam o comprovante (imagem ou PDF). O nome fica **amarelo 📄**.
- **Administradores** abrem o comprovante, **validam** (o nome fica **verde ✅**) ou **recusam** (o arquivo é apagado e a pessoa pode enviar outro). Depois de validar, dá pra excluir o arquivo para liberar espaço.
- Cada **campanha** tem nome, imagem e uma lista de pessoas. Cada **mês** pode estar **em aberto** ou **encerrado**. A página da campanha só mostra os meses em aberto.

## Tecnologias

| Parte | O que é | Custo |
|---|---|---|
| Banco, login e arquivos | [Supabase](https://supabase.com) (Postgres + Auth + Storage) | grátis |
| Site | HTML, CSS e JavaScript puro, sem build | grátis |
| Hospedagem | GitHub Pages, Netlify ou Vercel (qualquer hospedagem estática) | grátis |

```
index.html          página única
css/style.css       visual (paleta creme, caramelo, oliva)
js/config.js        URL e chave do Supabase  ← você edita
js/app.js           rotas
js/campanha.js      página pública da campanha
js/admin.js         painel do administrador
js/ui.js            utilitários de interface
js/supabase.js      conexão com o Supabase
supabase/schema.sql tabelas, regras de segurança e buckets  ← você roda
```

---

## Passo a passo

### 1. Criar o projeto no Supabase

1. Entre em <https://supabase.com> e crie uma conta (pode ser com o GitHub).
2. Clique em **New project**. Escolha um nome, crie uma senha para o banco (guarde-a) e a região **South America (São Paulo)**.
3. Espere uns 2 minutos até o projeto ficar pronto.

### 2. Criar o banco

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Copie **todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), cole e clique em **Run**.
3. Deve aparecer *Success. No rows returned*.

Isso cria as tabelas, as regras de segurança e os dois "baldes" de arquivos: `comprovantes` (privado) e `campanhas` (público, para as imagens).

> Pode rodar o arquivo de novo sempre que ele for atualizado. Ele não apaga dados.

### 3. Criar o administrador

1. Vá em **Authentication → Users → Add user → Create new user**.
2. Informe e-mail e senha e marque **Auto Confirm User**.
3. Volte ao **SQL Editor** e rode, trocando pelo e-mail que você usou:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```

4. **Importante:** em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Assim ninguém consegue criar conta sozinho.

Para ter mais administradores, repita os passos 1 a 3.

### 4. Ligar o site ao Supabase

1. Em **Project Settings → API** (ou **Data API / API Keys**), copie:
   - **Project URL** (ex.: `https://abcdxyz.supabase.co`)
   - a chave **anon public** (ou **publishable**)
2. Abra `js/config.js` e cole os dois valores:

   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

> A chave anon é pública por natureza, pode ficar no código. **Nunca** coloque a chave `service_role` / `secret` aqui.

### 5. Testar no computador

Precisa de um servidor local, porque abrir o `index.html` direto não funciona com módulos JavaScript. Escolha um:

```bash
python3 -m http.server 8000
```

```bash
npx serve .
```

Abra <http://localhost:8000>, clique em **Área do administrador**, entre com o e-mail e a senha do passo 3 e crie a primeira campanha.

### 6. Publicar (GitHub Pages)

1. Faça commit do `js/config.js` preenchido e envie para a branch `main`.
2. No GitHub, abra **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em 1 ou 2 minutos o site estará em `https://SEU-USUARIO.github.io/renatinho/`.

Também funciona no Netlify ou na Vercel: importe o repositório, sem comando de build, com a pasta de publicação na raiz.

---

## Como usar

### Administrador (`#/admin`)

1. **Nova campanha:** informe o nome. O endereço (ex.: `racao-dos-gatinhos`) é criado sozinho.
2. **Pessoas:** cadastre os nomes. Pessoas **ativas** entram automaticamente em cada mês novo. **Desativar** tira a pessoa dos próximos meses sem mexer nos anteriores.
3. **Abrir mês:** escolha mês e ano. A lista do mês é criada com todas as pessoas ativas.
4. **Editar lista:** inclua ou remova pessoas só daquele mês.
5. **Encerrar:** o mês some da página pública. Ele continua visível no painel (botão **Ver**) e pode ser reaberto.
6. **Validar:** na página da campanha, toque num nome com 📄 para ver o comprovante e escolher **Validar** ou **Recusar**. Depois de validado, aparece **Excluir comprovante**.

### Quem contribui

Abra o link da campanha (ex.: `https://.../#/c/racao-dos-gatinhos`), toque no seu nome, depois em **Informar pagamento**, escolha o arquivo e envie.

Se houver uma única campanha, a página inicial já abre direto nela.

---

## Segurança

- Qualquer pessoa pode **ver** campanhas, nomes e status dos pagamentos, mas **não** os comprovantes.
- Visitantes só conseguem **enviar** um comprovante para um nome **pendente** de um mês **em aberto**, e apenas uma vez. Isso é garantido pelo banco, não só pela tela.
- Arquivos aceitos: JPG, PNG, WEBP, GIF ou PDF, até 5 MB. Imagens de campanha até 2 MB.
- Só administradores podem alterar qualquer coisa.

## Próximas ideias (v1)

- Valor da contribuição e total arrecadado por mês
- Marcar como pago sem comprovante (pagamento em dinheiro)
- Histórico por pessoa
- Notificação ao administrador quando chegar comprovante
