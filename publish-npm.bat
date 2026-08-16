for /D %%D in (*) do (
    if exist "%%D\package.json" (
    pushd "%%D"
    npm publish --ignore-scripts
    popd
    )
)