import type zhHant from '../zh-Hant/common';
import type { Shape } from '../../shape';

const common: Shape<typeof zhHant> = {
  brand: 'Socrates Classroom',
  loading: 'Cargando…',
  notFound: {
    title: 'No encontramos esta página',
    body: 'Puede que la dirección esté mal escrita o que la página ya no exista.',
    back: 'Volver al inicio',
  },
  errors: {
    AUTH_INVALID_CREDENTIALS: 'El nombre de usuario, el correo o la contraseña no son correctos.',
    AUTH_TOKEN_INVALID: 'Este enlace ya no es válido. Pide uno nuevo.',
    ACCOUNT_DATA_TAKEN: 'Estos datos ya están en uso. Inicia sesión o restablece tu contraseña.',
    USERNAME_TAKEN: 'Ese nombre de usuario ya está en uso. Elige otro.',
    EMAIL_TAKEN: 'Ese correo ya está registrado. Inicia sesión o restablece la contraseña si la olvidaste.',
    ACCOUNT_PENDING_VERIFICATION: 'Ese nombre de usuario o correo ya está registrado y espera la verificación. Si es tu cuenta, inicia sesión y reenvía el correo de verificación. Si no, quedará libre cuando caduque el enlace (24 horas después del último envío) y podrás registrarte.',
    LOGIN_REQUIRED: 'Primero inicia sesión.',
    RATE_LIMITED: 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    invalidInput: 'Algunos campos no tienen el formato correcto. Revísalos e inténtalo de nuevo.',
    server: 'El servidor no puede procesar esto ahora. Inténtalo más tarde.',
    generic: 'No se pudo completar. Inténtalo más tarde.',
  },
  comingSoon: {
    title: 'Próximamente',
    body: 'Esta función todavía está en construcción y se abrirá más adelante.',
    back: 'Volver al inicio',
  },
};
export default common;
