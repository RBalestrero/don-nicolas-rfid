# Configuración de GitHub — Don Nicolás RFID

## Autenticación con GitHub CLI

El proyecto usa `gh` para crear el repositorio y hacer push. Si el push falla con:

```
refusing to allow a Personal Access Token to create or update workflow
`.github/workflows/ci.yml` without `workflow` scope
```

necesitás ampliar los permisos del token una sola vez.

### Pasos

1. Abrí Git Bash en la carpeta del proyecto.

2. Agregá `gh` al PATH (si no lo reconoce):

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
```

3. Refrescá la autenticación con el scope `workflow`:

```bash
gh auth refresh -h github.com -s workflow
```

4. La terminal mostrará un **código de un solo uso** (formato `XXXX-XXXX`) y una URL:

```
! First copy your one-time code: XXXX-XXXX
Press Enter to open github.com in your browser...
```

5. Ingresá ese código en: **https://github.com/login/device**

   > El código expira en pocos minutos y solo sirve una vez. No lo guardes en archivos ni lo commitees al repo.

6. Autorizá el acceso en el navegador y volvé a la terminal.

7. Subí los commits pendientes:

```bash
cd "/c/Users/Administrator/Desktop/Proyectos RFID/Don_Nicolas"
git push origin main
```

### Verificar que quedó bien

```bash
gh auth status
git status
```

`gh auth status` debe mostrar el scope `workflow`. `git status` debe indicar `Your branch is up to date with 'origin/main'`.

## Crear el repositorio (solo primera vez)

Si el remoto aún no existe:

```bash
gh auth login
gh repo create don-nicolas-rfid --private --source=. --remote=origin --push
```

## Solución de problemas

| Error | Solución |
|-------|----------|
| `command not found: gh` | `export PATH="$PATH:/c/Program Files/GitHub CLI"` |
| `command not found: make` | Usá los comandos directos del [README](../README.md) |
| Push rechazado por `workflow` scope | Ejecutá `gh auth refresh -h github.com -s workflow` |
| Código expirado | Volvé a ejecutar `gh auth refresh` para obtener uno nuevo |
