import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    label: 'Menú principal',
    home: 'Inicio',
    groups: 'Clases en grupo',
    bank: 'Mi banco de preguntas',
    store: 'Tienda de preguntas',
    settings: 'Conexiones de IA',
  },
  skip: 'Saltar al contenido principal',
  language: 'Idioma',
  logout: 'Cerrar sesión',
  account: {
    menu: 'Menú de la cuenta',
    settings: 'Ajustes personales',
    language: 'Idioma — {{name}}',
  },
  collapse: 'Contraer barra lateral',
  expand: 'Expandir barra lateral',
  groups: {
    teacherLink: 'Gestionar clases en grupo (docente)',
  },
};
export default shell;
