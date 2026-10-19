import type zhHant from '../zh-Hant/auth';
import type { Shape } from '../../shape';

const auth: Shape<typeof zhHant> = {
  hero: {
    eyebrow: 'SOCRATES · SOCRATES CLASSROOM',
    tagline: 'Pregunta a pregunta, descubre los principios que sostienes.',
    sub: 'Expresar, repreguntar, encontrarse. Cada punto de vista tiene su lugar.',
  },
  fields: {
    identifier: 'Nombre de usuario o correo',
    username: 'Nombre de usuario',
    email: 'Correo electrónico',
    password: 'Contraseña',
    newPassword: 'Nueva contraseña',
  },
  login: { title: 'Te damos la bienvenida', submit: 'Iniciar sesión' },
  register: {
    title: 'Crear una cuenta',
    hint: 'La contraseña debe tener al menos 12 caracteres. Después del registro te enviaremos un correo de verificación.',
    submit: 'Registrarse',
  },
  forgot: {
    title: 'Restablecer la contraseña',
    hint: 'Escribe el correo con el que te registraste y te enviaremos un enlace para restablecerla.',
    submit: 'Enviar correo',
    sent: 'Si ese correo está registrado, ya te enviamos el enlace.',
  },
  reset: {
    title: 'Elegir una nueva contraseña',
    submit: 'Guardar contraseña',
    done: 'Tu contraseña se actualizó. Inicia sesión con la nueva.',
  },
  fieldErrors: {
    username: {
      missing: 'Escribe un nombre de usuario.',
      tooShort: 'El nombre de usuario necesita al menos {{min}} caracteres.',
      tooLong: 'El nombre de usuario puede tener como máximo {{max}} caracteres.',
      format: 'El nombre de usuario no tiene un formato válido.',
      pattern: 'Usa solo letras, números, guion bajo (_), punto (.) o guion (-), sin espacios.',
    },
    email: {
      missing: 'Escribe un correo electrónico.',
      tooShort: 'El correo necesita al menos {{min}} caracteres.',
      tooLong: 'El correo puede tener como máximo {{max}} caracteres.',
      format: 'El correo no tiene un formato válido.',
      pattern: 'El correo no tiene un formato válido.',
    },
    password: {
      missing: 'Escribe una contraseña.',
      tooShort: 'La contraseña necesita al menos {{min}} caracteres.',
      tooLong: 'La contraseña puede tener como máximo {{max}} caracteres.',
      format: 'La contraseña no tiene un formato válido.',
      pattern: 'La contraseña no tiene un formato válido.',
    },
  },
  busy: 'Procesando…',
  links: { login: 'Volver a iniciar sesión', register: 'Registrarse', forgot: 'Olvidé mi contraseña' },
  verify: {
    title: 'Confirma tu correo',
    body: 'Enviamos un correo de verificación a {{email}}. Abre el enlace para empezar a unirte a cursos.',
    waiting: 'Esperando la verificación. Esta página seguirá sola cuando confirmes.',
    resend: 'Reenviar correo de verificación',
    resent: 'Volvimos a enviar el correo de verificación.',
    checked: 'Ya lo verifiqué',
    help: '¿No llegó? Revisa la carpeta de spam. Si el correo está mal, cierra sesión y regístrate de nuevo con el correcto.',
    verifying: 'Verificando tu correo…',
    success: 'Tu correo quedó verificado.',
    failed: 'Este enlace de verificación ya no es válido. Pide uno nuevo.',
    notYet: 'Todavía no está verificado. Abre el enlace del correo.',
    cooldown: 'Reenviar en {{seconds}} s',
    localPreview: 'Prueba local: abrir este enlace de verificación',
    loginToResend: 'Inicia sesión para reenviar el correo',
    logout: 'Cerrar sesión',
  },
};
export default auth;
