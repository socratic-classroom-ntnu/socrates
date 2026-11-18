import type zhHant from '../zh-Hant/shell';
import type { Shape } from '../../shape';

const shell: Shape<typeof zhHant> = {
  nav: {
    admin: 'Administración',
    label: 'Menú principal',
    home: 'Inicio',
    dialogues: 'Mis diálogos',
    me: 'Yo',
    bank: 'Mi banco de preguntas',
    store: 'Tienda de preguntas',
    settings: 'Conexiones de IA',
  },
  skip: 'Saltar al contenido principal',
  language: 'Idioma',
  logout: 'Cerrar sesión',
  account: {
    menu: 'Menú de la cuenta',
    sheet: 'Cuenta',
    tag: { student: 'Estudiante', teacher: 'Docente', guest: 'Invitado' },
    guestUntil: 'Se guarda hasta el {{date}}',
    guestNote: 'Un invitado solo existe en este navegador. En otro dispositivo, o si borras los datos del navegador, no se pueden recuperar los registros.',
    guestRegister: 'Regístrate para guardar tus registros',
    guestLogin: '¿Ya tienes cuenta? Inicia sesión',
    settings: 'Ajustes personales',
    language: 'Idioma — {{name}}',
  },
  collapse: 'Contraer barra lateral',
  expand: 'Expandir barra lateral',
  groups: {
    teacherLink: 'Gestionar clases en grupo (docente)',
  },
  crossRole: {
    illustration: 'Dos puertas, una de ellas cerrada con llave',
    home: 'Volver al inicio',
    switch: { teacher: 'Cerrar sesión y usar una cuenta de docente', student: 'Cerrar sesión y usar una cuenta de estudiante' },
    teacherPage: { title: 'Esta página es para docentes', body1: 'Iniciaste sesión con una cuenta de estudiante.', body2: 'Si eres docente, cierra sesión y entra con tu cuenta de docente.' },
    studentPage: { title: 'Esta página es para estudiantes', body1: 'Iniciaste sesión con una cuenta de docente.', body2: 'Las páginas de estudiante se abren con una cuenta de estudiante.' },
    join: {
      title: 'Para unirte necesitas una cuenta de estudiante',
      scannedCourse: 'Escaneaste el código QR del curso',
      scannedActivity: 'Escaneaste un código QR de actividad de',
      body1: 'Las cuentas de docente no pueden unirse a un curso ni a una actividad.',
      body2: 'Para participar como estudiante, cierra sesión, entra o regístrate con una cuenta de estudiante y vuelve a escanear.',
    },
  },
};
export default shell;
