import { settings } from './settings.js';

// Button and label text. Curriculum text lives in data/content.json and data/curriculum.json.
export const strings = {
  title: { pt: 'Sistema Guarda', en: 'Guard System' },
  modules: { pt: 'Módulos', en: 'Modules' },
  lesson: { pt: 'Montar aula', en: 'Lesson builder' },
  method: { pt: 'Método', en: 'Method' },
  week: { pt: 'Esta semana', en: 'This week' },
  weekLead: { pt: 'O que treinamos nesta semana. Perdeu a aula? Comece por aqui.', en: 'What we are training this week. Missed class? Start here.' },
  tapHint: { pt: 'Toque numa técnica para ver detalhes.', en: 'Tap a technique for details.' },

  mine: { pt: 'Seu sistema', en: 'Your system' },
  bookTag: { pt: 'Do livro Gracie Jiu-Jitsu', en: 'From the Gracie Jiu-Jitsu book' },
  bookReference: { pt: 'Referência: Helio Gracie, livro Gracie Jiu-Jitsu.', en: 'Reference: Helio Gracie, Gracie Jiu-Jitsu (book).' },
  stage: { pt: 'Etapa', en: 'Stage' },
  whatItIs: { pt: 'O que é', en: 'What it is' },
  steps: { pt: 'Passo a passo', en: 'Step by step' },
  keyPoint: { pt: 'Ponto-chave', en: 'Key point' },
  drill: { pt: 'Como treinar', en: 'How to drill' },
  close: { pt: 'Fechar', en: 'Close' },
  back: { pt: 'Voltar', en: 'Back' },
  nextStage: { pt: 'Próxima etapa', en: 'Next stage' },
  whereTo: { pt: 'Para onde ir', en: 'Where to go' },
  next: { pt: 'Próximo passo', en: 'Next step' },
  chain: { pt: 'Combina com', en: 'Chains with' },
  combo: { pt: 'Se ele defender', en: 'If he defends' },
  counter: { pt: 'Do outro lado da posição', en: 'The other side of the position' },
  games: { pt: 'Jogos de treino', en: 'Training games' },
  gamesLead: { pt: 'Jogos com regras e objetivos claros. Mude o ponto de partida, o tempo ou a resistência para ajustar o nível.', en: 'Games with clear rules and goals. Change the start position, time or resistance to adjust the level.' },
  who: { pt: 'Quem', en: 'Who' },
  wins: { pt: 'Vence', en: 'Wins' },
  time: { pt: 'Tempo', en: 'Time' },
  techniques: { pt: 'técnicas', en: 'techniques' },

  myTree: { pt: 'Minha árvore', en: 'My tree' },
  addToTree: { pt: 'Adicionar à minha árvore', en: 'Add to my tree' },
  inTree: { pt: 'Na minha árvore', en: 'In my tree' },
  treeLead: { pt: 'Sua árvore de estudo. Abra qualquer técnica e toque no coração para trazê-la para cá.', en: 'Your study tree. Open any technique and tap the heart to bring it here.' },
  treeEmpty: { pt: 'Sua árvore está em branco', en: 'Your tree is empty' },
  treeEmptyHint: { pt: 'Abra uma técnica em qualquer aba e toque em “Adicionar à minha árvore”. Cada técnica salva aparece aqui, no lugar dela na luta.', en: 'Open a technique in any tab and tap “Add to my tree”. Every saved technique shows up here, in its place in the fight.' },
  fightOrder: { pt: 'Na ordem da luta', en: 'Fight order' },
  myOrder: { pt: 'Na minha ordem', en: 'My order' },
  remove: { pt: 'Remover', en: 'Remove' },
  moveUp: { pt: 'Subir', en: 'Move up' },
  moveDown: { pt: 'Descer', en: 'Move down' },
  emptyTree: { pt: 'Esvaziar minha árvore', en: 'Empty my tree' },
  emptyTreeQuestion: { pt: 'Tirar todas as técnicas da sua árvore?', en: 'Remove every technique from your tree?' },
  yesEmpty: { pt: 'Sim, esvaziar', en: 'Yes, empty it' },
  cancel: { pt: 'Cancelar', en: 'Cancel' },

  signIn: { pt: 'Entrar', en: 'Sign in' },
  signInWithGoogle: { pt: 'Entrar com Google', en: 'Sign in with Google' },
  signOut: { pt: 'Sair', en: 'Sign out' },
  signedInAs: { pt: 'Conectado como', en: 'Signed in as' },
  savedToAccount: { pt: 'Sua árvore, idioma e tema ficam salvos na sua conta.', en: 'Your tree, language and theme are saved to your account.' },
  signInToSave: { pt: 'Sua árvore fica só neste aparelho. Entre com Google para tê-la em qualquer aparelho.', en: 'Your tree is only on this device. Sign in with Google to have it on every device.' },
  signInFailed: { pt: 'Não foi possível entrar. Tente de novo.', en: "Couldn't sign in. Please try again." },
  darkMode: { pt: 'Modo escuro', en: 'Dark mode' },
  lightMode: { pt: 'Modo claro', en: 'Light mode' },

  principles: { pt: 'Princípios', en: 'Principles' },
  ladder: { pt: 'Escada de resistência', en: 'Resistance ladder' },

  lessonIntro: { pt: 'Escolha a parte da luta e 2 ou 3 técnicas. O plano com tempos aparece ao lado e pode ser copiado.', en: 'Pick the part of the fight and 2 or 3 techniques. The timed plan appears alongside and can be copied.' },
  partOfFight: { pt: 'Parte da luta', en: 'Part of the fight' },
  length: { pt: 'Duração', en: 'Length' },
  techniquesLabel: { pt: 'Técnicas', en: 'Techniques' },
  game: { pt: 'Jogo', en: 'Game' },
  noneChosen: { pt: 'Nenhuma técnica escolhida ainda.', en: 'No techniques picked yet.' },
  copyPlan: { pt: 'Copiar plano', en: 'Copy plan' },
  copied: { pt: 'Copiado', en: 'Copied' },
  copyFailed: { pt: 'Não deu para copiar; selecione o texto do plano.', en: "Couldn't copy; select the plan text instead." },
  lessonTip: { pt: 'Dica: 2 ou 3 técnicas da mesma etapa funcionam melhor do que muitas.', en: 'Tip: 2 or 3 techniques from the same stage work better than many.' },
  loadFailed: { pt: 'Não foi possível carregar as técnicas. Recarregue a página.', en: 'Could not load the techniques. Reload the page.' },

  admin: { pt: 'Admin', en: 'Admin' },
  adminTitle: { pt: 'Admin · Esta semana', en: 'Admin · This week' },
  adminLead: { pt: 'O que você salvar aqui aparece para todos na hora.', en: 'What you save here shows for everyone right away.' },
  adminSignIn: { pt: 'Entre com uma conta de admin para mudar a semana.', en: 'Sign in with an admin account to change the week.' },
  notAdmin: { pt: 'Esta conta só pode ver o site. Peça ao professor para adicionar você como admin.', en: 'This account can only view the site. Ask the coach to add you as an admin.' },
  liveOnly: { pt: 'O admin só funciona no site publicado (sistemaguarda.com).', en: 'Admin only works on the published site (sistemaguarda.com).' },
  weekOf: { pt: 'Semana de', en: 'Week of' },
  weekTitle: { pt: 'Aula da semana', en: "This week's class" },
  note: { pt: 'Recado', en: 'Note' },
  pickTechniques: { pt: 'Técnicas da semana (2 a 4)', en: "This week's techniques (2 to 4)" },
  save: { pt: 'Salvar', en: 'Save' },
  saving: { pt: 'Salvando…', en: 'Saving…' },
  saved: { pt: 'Salvo. Já está no site.', en: 'Saved. It is on the site now.' },
  saveFailed: { pt: 'Não foi possível salvar.', en: "Couldn't save." },
  backToSite: { pt: '← Voltar ao site', en: '← Back to the site' },
};

export function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[settings.language] || value.pt || '';
}

export function t(key) {
  return text(strings[key]);
}
