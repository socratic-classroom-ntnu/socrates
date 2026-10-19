import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: 'Menú principal',
    home: 'Inicio',
    teaching: 'Mis cursos como docente',
    bank: 'Mi banco de preguntas',
    store: 'Tienda de preguntas',
    settings: 'Conexiones de IA',
  },
  skip: 'Ir al contenido principal',
  language: 'Idioma',
  logout: 'Cerrar sesión',
};
export default shell;
