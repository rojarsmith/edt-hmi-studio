using NativeWebHost;
using NativeWebHost.Linux;
using NativeWebHost.Mac;
#if WINDOWS
using NativeWebHost.Windows;
#endif

var builder = NativeWebApp.CreateBuilder(args)
    .Configure(options =>
    {
        options.Title = "EDT HMI Studio";
        options.CustomScheme = "app";
        options.ContentRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        options.StartUrl = "app://localhost/index.html";
        options.Width = 1440;
        options.Height = 960;
        options.StartMaximized = true;
        options.ScrollBarMode = NativeWebScrollBarMode.Auto;
        options.BuiltInTitleBarStyle = NativeWebBuiltInTitleBarStyle.VsCode;
        options.WindowStyle = OperatingSystem.IsWindows()
            ? NativeWebWindowStyle.VsCode
            : NativeWebWindowStyle.Frameless;
    })
    .UseDesktopApp(new EdtHmiStudioDesktopApp());

ConfigureCurrentPlatform(builder);

await builder.Build().RunAsync();

static void ConfigureCurrentPlatform(NativeWebHostBuilder builder)
{
    if (OperatingSystem.IsLinux())
    {
        builder
            .UseAdapter(new WebKitGtkAdapterFactory())
            .UseRuntime(new GtkRuntime());
        return;
    }

#if WINDOWS
    if (OperatingSystem.IsWindows())
    {
        builder
            .UseAdapter(new NativeWebView2AdapterFactory())
            .UseRuntime(new Win32Runtime());
        return;
    }
#endif

    if (OperatingSystem.IsMacOS())
    {
        builder
            .UseAdapter(new WKWebViewAdapterFactory())
            .UseRuntime(new MacRuntime());
        return;
    }

    throw new PlatformNotSupportedException("This platform is not supported yet.");
}

sealed class EdtHmiStudioDesktopApp : IDesktopApp
{
    public Task OnStartAsync(IWebViewAdapter adapter, CancellationToken cancellationToken = default)
        => Task.CompletedTask;

    public Task OnClosingAsync(CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
