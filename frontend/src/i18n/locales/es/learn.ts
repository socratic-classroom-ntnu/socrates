import type zhHant from '../zh-Hant/learn';
import type { Shape } from '../../shape';

const learn: Shape<typeof zhHant> = {
  breadcrumb: 'Mis cursos',
  teacher: 'Docente: {{name}}',
  code: 'Código del curso',
  copyCode: 'Copiar código del curso',
  filterLabel: 'Filtrar actividades',
  filters: {
    all: 'Todas',
    open: 'Abiertas',
    scheduled: 'Próximas',
    ended: 'Terminadas',
  },
  sections: {
    open: 'Abiertas',
    scheduled: 'Próximas',
    ended: 'Terminadas',
  },
  questions: '{{count}} preguntas',
  questions_one: '{{count}} pregunta',
  questions_other: '{{count}} preguntas',
  openUntil: 'Abierta hasta el {{end}}',
  phoneOpen: '{{questions}} · abierta hasta el {{end}}',
  opensAt: 'Se abre el {{start}}',
  endedAt: 'Terminó el {{end}}',
  start: 'Empezar',
  nothing: 'Tu docente todavía no abrió ninguna actividad',
  notFound: {
    title: 'No encontramos este curso',
    body: 'Puede que el curso no exista o que todavía no te hayas unido.',
    back: 'Volver al inicio',
  },
  noMatch: 'No hay actividades que coincidan',
};
export default learn;
