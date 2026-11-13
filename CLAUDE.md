# Controle de Pagamentos das Campanhas (Renatinho) 🐾

## Instruções

Você ajuda a manter e evoluir o site de controle de pagamentos de campanhas, descrito abaixo. Responda sempre em português do Brasil, de forma simples e direta, e explique passo a passo quando o usuário pedir algo técnico (ele não é programador). Ao mudar o site, diga quais arquivos mudam. Nunca peça nem use a secret key do Supabase.

## O que é o site

Site simples para acompanhar quem já pagou a contribuição mensal em cada "campanha". Uma campanha é um nome, uma imagem e uma lista de pessoas.

- **Visitantes** (sem cadastro): tocam no próprio nome e clicam em "Informar pagamento", enviam imagem ou PDF (até 5 MB). O nome fica amarelo 📄 e não aceita outro comprovante. Visitantes não veem os comprovantes.
- **Administradores** (login por e-mail e senha): abrem o comprovante e escolhem Validar (verde ✅) ou Recusar (apaga o arquivo e libera novo envio). Também podem Cancelar validação, Excluir comprovante, Marcar como pago sem comprovante e Desfazer pagamento.
- **Meses**: cada mês fica "em aberto" ou "encerrado". A página pública só mostra meses em aberto. Ao abrir um mês, entram as pessoas ativas da campanha; a lista de cada mês pode ser editada.
- Se existir só uma campanha, a página inicial abre direto nela.

## Tecnologia

- Front-end: HTML, CSS e JavaScript puro, sem build. Biblioteca `@supabase/supabase-js` 2.118.0 via CDN.
- Banco, login e arquivos: Supabase (Postgres, Auth, Storage). Segurança por RLS e funções no banco.
- Hospedagem: GitHub Pages, publicando a branch `claude/sleepy-dijkstra-z0zjl0`. Endereço: https://giltonc.github.io/renatinho/ (admin: `#/admin`).
- Repositório: github.com/giltonc/renatinho
- Paleta: creme, caramelo, verde-oliva, amarelo e bordô, tirada de uma foto de gato.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | página única |
| `css/style.css` | visual e cores |
| `js/config.js` | URL do Supabase e publishable key (a key é pública, pode ficar no código) |
| `js/app.js` | rotas (`#/`, `#/c/<slug>`, `#/admin`, `#/admin/c/<slug>`) |
| `js/campanha.js` | página pública, envio de comprovante, popup de revisão do admin |
| `js/admin.js` | login e painel do administrador |
| `js/ui.js`, `js/supabase.js` | utilitários e conexão |
| `supabase/schema.sql` | tabelas, regras de segurança e buckets (pode rodar de novo sem perder dados) |

## Banco de dados

Tabelas: `admins`, `campanhas`, `pessoas`, `meses`, `pagamentos`. Status do pagamento: `pendente`, `enviado`, `validado`. Buckets: `comprovantes` (privado) e `campanhas` (público, imagens).

## Como cadastrar outro administrador

1. Supabase > Authentication > Users > Add user > Create new user (marcar Auto Confirm User).
2. No SQL Editor:
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'email@exemplo.com';
```
Listar admins: `select u.email from public.admins a join auth.users u on u.id = a.user_id;`

## Textos personalizados (manter)

- Comprovante enviado: "Comprovante enviado. Aguardando conferência do chefe Renatinho. 😸"
- Resumo do mês: "X de Y pagos · N aguardando conferência do chefe Renatinho"
- Nome verde: "Pagamento conferido pelo Renatinho. Obrigado! 💛"
- Ainda dizem "validar/validação" só em telas do admin (botão Validar, "Pagamento validado ✅"); posso trocar se quiser.

## Observações

- Sempre atualizar com Ctrl + Shift + R ao testar mudanças (o GitHub Pages guarda cache por uns 10 minutos).
- O código ainda está só na branch `claude/sleepy-dijkstra-z0zjl0`, não foi juntado na `main`.

## Próximas ideias

- Valor da contribuição e total arrecadado por mês
- Histórico por pessoa
- Aviso ao administrador quando chegar comprovante
- Tela para cadastrar administradores dentro do site
