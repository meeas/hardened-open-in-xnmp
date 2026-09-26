#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/*
 * Minimal GIO declarations used by this helper.
 * We intentionally depend only on the stable GLib/GIO ABI available in
 * Flatpak runtimes instead of requiring development headers at runtime.
 */
typedef int gboolean;
typedef int gint;
typedef unsigned int guint;
typedef unsigned long gsize;
typedef char gchar;
typedef void GDBusConnection;
typedef void GVariant;
typedef void GVariantType;
typedef void GUnixFDList;
typedef void GCancellable;
typedef struct _GError {
    guint domain;
    gint code;
    gchar *message;
} GError;

enum { G_BUS_TYPE_SESSION = 2 };
enum { G_DBUS_CALL_FLAGS_NONE = 0 };

extern GDBusConnection *g_bus_get_sync(int bus_type, GCancellable *cancellable, GError **error);
extern GVariantType *g_variant_type_new(const gchar *type_string);
extern void g_variant_type_free(GVariantType *type);
extern GVariant *g_variant_new_array(const GVariantType *child_type, GVariant * const *children, gsize n_children);
extern GVariant *g_variant_new(const gchar *format_string, ...);
extern void g_variant_get(GVariant *value, const gchar *format_string, ...);
extern void g_variant_unref(GVariant *value);
extern GVariant *g_dbus_connection_call_with_unix_fd_list_sync(
    GDBusConnection *connection,
    const gchar *bus_name,
    const gchar *object_path,
    const gchar *interface_name,
    const gchar *method_name,
    GVariant *parameters,
    const GVariantType *reply_type,
    int flags,
    gint timeout_msec,
    GUnixFDList *fd_list,
    GUnixFDList **out_fd_list,
    GCancellable *cancellable,
    GError **error);
extern gint g_unix_fd_list_get(GUnixFDList *list, gint index_, GError **error);
extern void g_object_unref(void *object);
extern void g_error_free(GError *error);

#define SERVICE_NAME "org.freedesktop.NativeMessagingProxy"
#define OBJECT_PATH  "/org/freedesktop/nativemessagingproxy"
#define INTERFACE    "org.freedesktop.NativeMessagingProxy"
#define HOST_NAME    "com.add0n.node"

#include "shim-allowlist.h"

#define BUF_SIZE 65536

struct channel {
    int src;
    int dst;
    unsigned char buf[BUF_SIZE];
    size_t off;
    size_t len;
    int src_open;
    int dst_open;
    int close_dst_at_eof;
};

static void die_gerror(const char *what, GError *error) {
    if (error && error->message)
        fprintf(stderr, "com.add0n.node proxy shim: %s: %s\n", what, error->message);
    else
        fprintf(stderr, "com.add0n.node proxy shim: %s\n", what);
    if (error)
        g_error_free(error);
    exit(1);
}

static int ends_with(const char *s, const char *suffix) {
    size_t slen = strlen(s), xlen = strlen(suffix);
    return slen >= xlen && memcmp(s + slen - xlen, suffix, xlen) == 0;
}

/* Exact registry matches only; origins do not identify a physical browser. */
static int allowed(const char *value, const char *const *list, size_t count) {
    for (size_t i = 0; i < count; i++)
        if (strcmp(value, list[i]) == 0) return 1;
    return 0;
}

static int determine_caller(int argc, char **argv, const char **mode, const char **extension_or_origin) {
    /* Chromium passes exactly the extension origin as argv[1] on Linux. */
    if (argc == 2 && allowed(argv[1], chromium_callers, sizeof(chromium_callers) / sizeof(chromium_callers[0]))) {
        *mode = "chromium";
        *extension_or_origin = argv[1];
        return 0;
    }

    /* Firefox passes manifest path then add-on ID. */
    if (argc == 3 && allowed(argv[2], mozilla_callers, sizeof(mozilla_callers) / sizeof(mozilla_callers[0])) &&
        argv[1][0] == '/' && ends_with(argv[1], "/com.add0n.node.json")) {
        *mode = "mozilla";
        *extension_or_origin = argv[2];
        return 0;
    }

    return -1;
}

static int set_nonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0)
        return -1;
    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0)
        return -1;
    return 0;
}

static int pump_channels(int host_stdin, int host_stdout, int host_stderr) {
    struct channel ch[3] = {
        { .src = STDIN_FILENO, .dst = host_stdin,  .off = 0, .len = 0, .src_open = 1, .dst_open = 1, .close_dst_at_eof = 1 },
        { .src = host_stdout,  .dst = STDOUT_FILENO, .off = 0, .len = 0, .src_open = 1, .dst_open = 1, .close_dst_at_eof = 0 },
        { .src = host_stderr,  .dst = STDERR_FILENO, .off = 0, .len = 0, .src_open = 1, .dst_open = 1, .close_dst_at_eof = 0 },
    };

    int fds[] = { STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO, host_stdin, host_stdout, host_stderr };
    for (size_t i = 0; i < sizeof(fds) / sizeof(fds[0]); i++)
        (void)set_nonblock(fds[i]);

    for (;;) {
        /* Once the host stdout and stderr are both finished, the host is gone. */
        if (!ch[1].src_open && ch[1].len == 0 && !ch[2].src_open && ch[2].len == 0)
            break;

        struct pollfd pfds[6];
        int map_chan[6];
        int map_write[6];
        nfds_t n = 0;

        for (int i = 0; i < 3; i++) {
            if (ch[i].src_open && ch[i].len < BUF_SIZE && ch[i].dst_open) {
                pfds[n] = (struct pollfd){ .fd = ch[i].src, .events = POLLIN | POLLHUP | POLLERR };
                map_chan[n] = i;
                map_write[n] = 0;
                n++;
            }
            if (ch[i].dst_open && ch[i].len > 0) {
                pfds[n] = (struct pollfd){ .fd = ch[i].dst, .events = POLLOUT | POLLHUP | POLLERR };
                map_chan[n] = i;
                map_write[n] = 1;
                n++;
            }
        }

        if (n == 0)
            break;

        int pr;
        do {
            pr = poll(pfds, n, -1);
        } while (pr < 0 && errno == EINTR);
        if (pr < 0) {
            perror("com.add0n.node proxy shim: poll");
            return 1;
        }

        for (nfds_t p = 0; p < n; p++) {
            if (!pfds[p].revents)
                continue;
            struct channel *c = &ch[map_chan[p]];

            if (!map_write[p]) {
                if (!c->src_open || !c->dst_open || c->len >= BUF_SIZE)
                    continue;

                if (c->off && c->off + c->len == BUF_SIZE) {
                    memmove(c->buf, c->buf + c->off, c->len);
                    c->off = 0;
                }
                size_t room = BUF_SIZE - (c->off + c->len);
                if (room == 0)
                    continue;

                ssize_t r = read(c->src, c->buf + c->off + c->len, room);
                if (r > 0) {
                    c->len += (size_t)r;
                } else if (r == 0) {
                    c->src_open = 0;
                    if (c->len == 0 && c->dst_open && c->close_dst_at_eof) {
                        close(c->dst);
                        c->dst_open = 0;
                    }
                } else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
                    c->src_open = 0;
                    if (c->len == 0 && c->dst_open && c->close_dst_at_eof) {
                        close(c->dst);
                        c->dst_open = 0;
                    }
                }
            } else {
                if (!c->dst_open || c->len == 0)
                    continue;

                ssize_t w = write(c->dst, c->buf + c->off, c->len);
                if (w > 0) {
                    c->off += (size_t)w;
                    c->len -= (size_t)w;
                    if (c->len == 0) {
                        c->off = 0;
                        if (!c->src_open && c->dst_open && c->close_dst_at_eof) {
                            close(c->dst);
                            c->dst_open = 0;
                        }
                    }
                } else if (w < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
                    c->dst_open = 0;
                    c->src_open = 0;
                    c->len = 0;
                    c->off = 0;
                    if (c->close_dst_at_eof)
                        close(c->dst);
                }
            }
        }
    }

    if (ch[0].dst_open)
        close(ch[0].dst);
    close(host_stdout);
    close(host_stderr);
    return 0;
}

int main(int argc, char **argv) {
    const char *mode = NULL;
    const char *extension_or_origin = NULL;
    GError *error = NULL;
    GDBusConnection *connection = NULL;
    GVariantType *dict_entry_type = NULL;
    GVariant *options = NULL;
    GVariant *parameters = NULL;
    GVariant *reply = NULL;
    GUnixFDList *out_fds = NULL;
    gint fd_stdin_index = -1, fd_stdout_index = -1, fd_stderr_index = -1;
    const char *handle = NULL;
    int host_stdin = -1, host_stdout = -1, host_stderr = -1;
    int rc;

    signal(SIGPIPE, SIG_IGN);

    if (argc == 2 && strcmp(argv[1], "--self-test") == 0) {
        fprintf(stderr, "com.add0n.node proxy shim: self-test OK\n");
        return 0;
    }

    if (determine_caller(argc, argv, &mode, &extension_or_origin) != 0) {
        fprintf(stderr, "com.add0n.node proxy shim: refusing unexpected native-messaging caller\n");
        return 64;
    }

    connection = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
    if (!connection)
        die_gerror("cannot connect to the session D-Bus", error);

    dict_entry_type = g_variant_type_new("{sv}");
    if (!dict_entry_type) {
        fprintf(stderr, "com.add0n.node proxy shim: cannot create GVariant type\n");
        g_object_unref(connection);
        return 1;
    }

    options = g_variant_new_array(dict_entry_type, NULL, 0);
    g_variant_type_free(dict_entry_type);
    parameters = g_variant_new("(sss@a{sv})", HOST_NAME, extension_or_origin, mode, options);

    reply = g_dbus_connection_call_with_unix_fd_list_sync(
        connection,
        SERVICE_NAME,
        OBJECT_PATH,
        INTERFACE,
        "Start",
        parameters,
        NULL,
        G_DBUS_CALL_FLAGS_NONE,
        -1,
        NULL,
        &out_fds,
        NULL,
        &error);

    if (!reply)
        die_gerror("NativeMessagingProxy.Start failed", error);
    if (!out_fds) {
        fprintf(stderr, "com.add0n.node proxy shim: proxy returned no file descriptors\n");
        g_variant_unref(reply);
        g_object_unref(connection);
        return 1;
    }

    g_variant_get(reply, "(hhh&o)", &fd_stdin_index, &fd_stdout_index, &fd_stderr_index, &handle);
    (void)handle; /* The proxy closes the session when this D-Bus client disconnects. */

    host_stdin = g_unix_fd_list_get(out_fds, fd_stdin_index, &error);
    if (host_stdin < 0)
        die_gerror("cannot obtain native host stdin", error);
    host_stdout = g_unix_fd_list_get(out_fds, fd_stdout_index, &error);
    if (host_stdout < 0)
        die_gerror("cannot obtain native host stdout", error);
    host_stderr = g_unix_fd_list_get(out_fds, fd_stderr_index, &error);
    if (host_stderr < 0)
        die_gerror("cannot obtain native host stderr", error);

    rc = pump_channels(host_stdin, host_stdout, host_stderr);

    g_object_unref(out_fds);
    g_variant_unref(reply);
    g_object_unref(connection);
    return rc;
}
