import type zhHant from '../zh-Hant/editor';
import type { Shape } from '../../shape';

const editor: Shape<typeof zhHant> = {
  titleNew: 'Nueva actividad',
  titleEdit: 'Editar actividad',
  crumb: 'Mis clases',
  actions: {
    cancel: 'Cancelar',
    saveToList: 'Guardar en la lista',
    create: 'Crear actividad',
    saveChanges: 'Guardar cambios',
    delete: 'Eliminar actividad',
    back: 'Volver',
    copy: 'Copiar como nueva actividad',
    toCourse: 'Volver al curso',
  },
  autosave: {
    idle: 'Tu trabajo se guarda automáticamente en este dispositivo',
    saved: 'Guardado en este dispositivo',
  },
  restore: {
    title: 'Encontramos trabajo sin terminar del {{time}}',
    body: 'Este dispositivo tiene trabajo que nunca se guardó. ¿Quieres recuperarlo o descartarlo y quedarte con lo que ves ahora?',
    discard: 'Descartar',
    restore: 'Recuperar',
  },
  notices: {
    savedToList: 'Guardada en la lista de actividades. Los estudiantes todavía no la ven',
    saved: 'Cambios guardados',
    copied: 'Esta es una copia de «{{title}}». Edítala y luego crea la actividad.',
    publishFailed: 'Tus cambios se guardaron pero no se publicaron; los estudiantes siguen viendo la versión anterior',
    pending: 'Cambios sin publicar: los estudiantes siguen viendo la versión anterior. Pulsa «Guardar cambios» para volver a publicar.',
    stale: 'La actividad cambió mientras tanto, así que se volvió a cargar',
    notFound: 'Esta actividad ya no existe',
  },
  locked: {
    title: 'El tema está bloqueado',
    body: 'Todavía puedes cambiar el nombre y la hora de cierre. Para cambiar el tema, cópiala como nueva actividad.',
    pendingBody: 'La actividad se bloqueó antes de publicar tus cambios, así que los estudiantes ven la versión anterior. Cópiala como nueva actividad para conservar los cambios.',
    readonlyBody: 'Esta actividad ya terminó y no se puede editar. Cópiala como nueva actividad para usarla otra vez.',
  },
  sections: {
    basics: 'Datos básicos',
    collapse: 'Contraer «{{name}}»',
    expand: 'Expandir «{{name}}»',
  },
  fields: {
    required: '(obligatorio)',
    title: 'Tema',
    titleHint: 'Escribe unas frases. Sócrates parte de ellas para redactar un primer escenario para cada estudiante. También es el nombre de la actividad.',
    start: 'Inicio',
    startNow: 'Abrir al crearla',
    startAt: 'A una hora fija',
    opened: 'Abierta el {{time}}',
    end: 'Cierre',
    windowHint: 'Termina automáticamente a esa hora; también puedes empezarla o terminarla antes desde la página de la actividad. Después, los estudiantes solo pueden revisar su propio registro.',
    lockedWindowHint: 'Puedes retrasar el cierre para que quienes no terminaron sigan; para terminarla antes, usa la página de la actividad.',
  },
  errors: {
    title: 'Escribe el tema',
    start: 'Indica la hora de inicio',
    end: 'Indica la hora de cierre',
    endBeforeStart: 'El cierre debe ser posterior al inicio',
    endPast: 'La hora de cierre ya pasó',
    startPast: 'La hora de inicio ya pasó. Para abrirla ya, elige «Abrir al crearla».',
    summary: 'Faltan algunos campos.',
    missing: 'está sin completar',
    beforeStart: 'debe ser posterior al inicio',
    past: 'ya pasó',
  },
  loadFailed: 'No se pudo cargar la actividad.',
};
export default editor;
