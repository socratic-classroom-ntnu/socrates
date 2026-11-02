import type zhHant from '../zh-Hant/home';
import type { Shape } from '../../shape';

const home: Shape<typeof zhHant> = {
  greeting: {
    morning: 'Buenos días, {{name}}',
    afternoon: 'Buenas tardes, {{name}}',
    evening: 'Buenas noches, {{name}}',
  },
  tabs: {
    label: 'Secciones de inicio',
    learn: 'Mis cursos',
    teach: 'Mis clases',
  },
  join: {
    label: 'Código del curso',
    placeholder: 'Escribe el código de 8 caracteres',
    phonePlaceholder: 'Código del curso',
    submit: 'Unirme al curso',
    phoneSubmit: 'Unirme',
    scan: 'Escanear',
    busy: 'Comprobando…',
    notFoundTitle: 'No encontramos este código',
    notFoundBody: 'Revisa otra vez el código de 8 caracteres que te dio tu docente. Si está bien escrito, pregúntale si el código cambió.',
  },
  create: 'Crear curso',
  phoneHint: 'Usa una computadora para gestionar cursos y actividades',
  empty: {
    learnTitle: 'Todavía no te uniste a ningún curso',
    learnBody: 'Los cursos a los que te unas aparecerán aquí',
    teachTitle: 'Todavía no enseñas ningún curso',
    teachBody: 'Los cursos que crees aparecerán aquí',
  },
  teaching: {
    live: 'En clase',
    students: '{{count}} estudiantes',
    students_one: '{{count}} estudiante',
    students_other: '{{count}} estudiantes',
    activities: '{{count}} actividades',
    activities_one: '{{count}} actividad',
    activities_other: '{{count}} actividades',
    counts: '{{students}} · {{activities}}',
    copyCode: 'Copiar código del curso',
  },
  learning: {
    open: 'Abierta',
    openCount: '{{count}} abiertas',
    none: 'Ninguna actividad abierta',
    phoneNone: 'Nada abierto',
    questions: '{{count}} preguntas',
    questions_one: '{{count}} pregunta',
    questions_other: '{{count}} preguntas',
    openMeta: '{{questions}} · abierta hasta el {{end}}',
    phoneOpenMeta: 'Abierta hasta el {{end}}',
    next: 'Siguiente: {{title}}',
    opensAt: 'Se abre el {{start}}',
    last: 'Última: {{title}}',
    endedAt: 'Terminó el {{end}}',
    nothing: 'Tu docente todavía no abrió ninguna actividad',
    start: 'Empezar',
  },
  loadFailed: 'No se pudo cargar la lista de cursos.',
};
export default home;
